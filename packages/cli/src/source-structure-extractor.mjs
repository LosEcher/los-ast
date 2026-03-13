import fs from 'node:fs/promises'
import path from 'node:path'

import { languageFromFilePath } from '@los-ast/core'

import { classifyActivationFromGuard, extractRouteRegistrations } from './route-guard-analysis.mjs'

const TEXT_SYMBOL_PATTERNS = [
  { kind: 'function', languages: ['typescript', 'javascript', 'tsx', 'jsx'], regex: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm },
  { kind: 'function', languages: ['typescript', 'javascript', 'tsx', 'jsx'], regex: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/gm },
  { kind: 'class', languages: ['typescript', 'javascript', 'tsx', 'jsx'], regex: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)\b/gm },
  { kind: 'interface', languages: ['typescript', 'tsx'], regex: /^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)\b/gm },
  { kind: 'type', languages: ['typescript', 'tsx'], regex: /^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\b/gm },
  { kind: 'variable', languages: ['typescript', 'javascript', 'tsx', 'jsx'], regex: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm },
  { kind: 'function', languages: ['rust'], regex: /^\s*(?:pub\s+)?fn\s+([A-Za-z_][\w]*)\s*\(/gm },
  { kind: 'class', languages: ['rust'], regex: /^\s*(?:pub\s+)?struct\s+([A-Za-z_][\w]*)\b/gm },
  { kind: 'interface', languages: ['rust'], regex: /^\s*(?:pub\s+)?trait\s+([A-Za-z_][\w]*)\b/gm },
  { kind: 'type', languages: ['rust'], regex: /^\s*(?:pub\s+)?type\s+([A-Za-z_][\w]*)\b/gm },
]

const TEXT_IMPORT_PATTERNS = [
  { kind: 'import', languages: ['typescript', 'javascript', 'tsx', 'jsx'], regex: /^\s*import(?:\s+type)?[\s\S]*?from\s+['"]([^'"]+)['"]/gm },
  { kind: 'import', languages: ['typescript', 'javascript', 'tsx', 'jsx'], regex: /^\s*import\s+['"]([^'"]+)['"]/gm },
  { kind: 'require', languages: ['typescript', 'javascript', 'tsx', 'jsx'], regex: /\brequire\(\s*['"]([^'"]+)['"]\s*\)/gm },
  { kind: 'use', languages: ['rust'], regex: /^\s*use\s+([^;]+);/gm },
]

const ROUTE_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'all']
const STATIC_STRING_TOKEN = "(?:\"([^\"\\r\\n]*)\"|'([^'\\r\\n]*)'|`([^`$\\r\\n]*)`)"

export const ROUTE_BINDS_LIMITATION_NOTE =
  'route_binds currently provides minimal Fastify literal-only runtime-like bind evidence; it is not full route truth'

export async function extractSourceStructure({ files, rootDir, deterministic }) {
  const structureFiles = []
  const structureSymbols = []
  const structureImports = []
  const structureDeclares = []
  const moduleInfos = new Map()

  for (const file of files) {
    const facts = await extractFileFacts(file, rootDir)
    structureFiles.push(facts.file)
    structureSymbols.push(...facts.symbols)
    structureImports.push(...facts.imports)
    structureDeclares.push(...facts.declares)
    if (facts.module) {
      moduleInfos.set(facts.module.file.path, facts.module)
    }
  }

  const routeDeclares = buildRouteDeclares(moduleInfos, deterministic)
  const routeMounts = buildRouteMounts(moduleInfos, deterministic)
  const routeBinds = buildRouteBinds(moduleInfos, deterministic)

  if (deterministic) {
    structureFiles.sort((a, b) => String(a.path).localeCompare(String(b.path)))
    structureSymbols.sort((a, b) => `${a.file}:${a.name}:${a.kind}`.localeCompare(`${b.file}:${b.name}:${b.kind}`))
    structureImports.sort((a, b) => `${a.from}:${a.to}:${a.kind}`.localeCompare(`${b.from}:${b.to}:${b.kind}`))
    structureDeclares.sort((a, b) => `${a.file}:${a.symbol}:${a.kind}`.localeCompare(`${b.file}:${b.symbol}:${b.kind}`))
  }

  return {
    structureFiles,
    structureSymbols,
    structureImports,
    structureDeclares,
    routeDeclares,
    routeMounts,
    routeBinds,
  }
}

export function normalizeRoutePath(prefix = '', routePath = '') {
  const rawPrefix = String(prefix || '').trim()
  const rawRoute = String(routePath || '').trim()

  if (!rawPrefix && !rawRoute) return '/'
  if (!rawPrefix) return rawRoute.startsWith('/') ? rawRoute : `/${rawRoute}`
  if (!rawRoute || rawRoute === '/') return rawPrefix || '/'

  const normalizedPrefix = rawPrefix === '/' ? '' : rawPrefix.replace(/\/+$/, '')
  const normalizedRoute = rawRoute.replace(/^\/+/, '')
  const combined = `${normalizedPrefix}/${normalizedRoute}`.replace(/\/{2,}/g, '/')
  return combined.startsWith('/') ? combined : `/${combined}`
}

export function classifyRouteTier(routePath) {
  const normalizedPath = normalizeRoutePath('', routePath)
  if (normalizedPath.startsWith('/experimental')) return 'experimental'
  if (normalizedPath.startsWith('/internal')) return 'internal'
  if (normalizedPath.startsWith('/vps-agent-web')) return 'vps_agent_web'
  return 'core'
}

export function classifyRouteActivation(routePath) {
  const tier = classifyRouteTier(routePath)
  if (tier === 'experimental') {
    return {
      mode: 'flag',
      flag: 'ENABLE_EXPERIMENTAL_ROUTES',
      default: false,
    }
  }

  if (tier === 'internal') {
    return {
      mode: 'flag',
      flag: 'ENABLE_INTERNAL_ROUTES',
      default: false,
    }
  }

  if (tier === 'vps_agent_web') {
    return {
      mode: 'flag',
      flag: 'ENABLE_VPS_AGENT_WEB_ROUTES',
      default: false,
      exposure: 'bridge',
    }
  }

  return {
    mode: 'always',
    default: true,
  }
}

function toPosixRelative(rootDir, filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/')
}

function readStaticStringMatch(match, startIndex = 1) {
  for (let offset = 0; offset < 3; offset += 1) {
    const value = match[startIndex + offset]
    if (value !== undefined) {
      return value
    }
  }
  return ''
}

function parseNamedSpecifiers(segment) {
  return String(segment || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const cleaned = part.replace(/^type\s+/, '').trim()
      const [importedName, localName] = cleaned.split(/\s+as\s+/).map((value) => value.trim()).filter(Boolean)
      return {
        importedName: importedName || cleaned,
        localName: localName || importedName || cleaned,
        importKind: 'named',
      }
    })
}

function extractDetailedImports(source) {
  const results = []
  const importRegex = /^\s*import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/gm

  let match
  while ((match = importRegex.exec(source)) !== null) {
    const clause = String(match[1] || '').trim()
    const specifier = String(match[2] || '').trim()
    const line = indexToLine(source, match.index)
    const normalizedClause = clause.replace(/^type\s+/, '').trim()

    if (!normalizedClause) continue

    if (normalizedClause.startsWith('{')) {
      for (const item of parseNamedSpecifiers(normalizedClause.slice(1, -1))) {
        results.push({ ...item, specifier, line })
      }
      continue
    }

    if (normalizedClause.includes('{')) {
      const braceIndex = normalizedClause.indexOf('{')
      const defaultSegment = normalizedClause.slice(0, braceIndex).replace(/,$/, '').trim()
      const namedSegment = normalizedClause.slice(braceIndex + 1, normalizedClause.lastIndexOf('}'))

      if (defaultSegment) {
        results.push({
          importedName: 'default',
          localName: defaultSegment,
          importKind: 'default',
          specifier,
          line,
        })
      }

      for (const item of parseNamedSpecifiers(namedSegment)) {
        results.push({ ...item, specifier, line })
      }
      continue
    }

    results.push({
      importedName: 'default',
      localName: normalizedClause,
      importKind: 'default',
      specifier,
      line,
    })
  }

  return results
}

function extractDetailedReexports(source) {
  const results = []
  const reexportRegex = /^\s*export\s+\{\s*default\s+as\s+([A-Za-z_$][\w$]*)\s*\}\s+from\s+['"]([^'"]+)['"]/gm

  let match
  while ((match = reexportRegex.exec(source)) !== null) {
    results.push({
      exportName: String(match[1] || '').trim(),
      source: String(match[2] || '').trim(),
      exportKind: 'default',
      line: indexToLine(source, match.index),
    })
  }

  return results
}

function extractConstBindings(source) {
  const results = []
  const constRegex = /^\s*const\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+);?/gm

  let match
  while ((match = constRegex.exec(source)) !== null) {
    results.push({
      name: String(match[1] || '').trim(),
      expression: String(match[2] || '').trim(),
      line: indexToLine(source, match.index),
    })
  }

  return results
}

function extractRoutePrefixDefaults(source) {
  const results = {}
  const routePrefixRegex = /ROUTE_PREFIX_(EXPERIMENTAL|INTERNAL|VPS_AGENT_WEB)\s*:\s*routePrefixSchema\.default\((`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\)/gm

  let match
  while ((match = routePrefixRegex.exec(source)) !== null) {
    const key = String(match[1] || '').trim().toLowerCase()
    const normalizedKey = key === 'vps_agent_web'
      ? 'vpsAgentWeb'
      : key.toLowerCase()
    results[normalizedKey] = parseStaticLiteral(String(match[2] || '').trim())
  }

  return results
}

function parseStaticLiteral(expression) {
  const trimmed = String(expression || '').trim()
  if (!trimmed) return null

  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
    || (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1)
  }

  if (trimmed.startsWith('`') && trimmed.endsWith('`') && !trimmed.includes('${')) {
    return trimmed.slice(1, -1)
  }

  return null
}

function resolveStaticExpression(expression, info, moduleInfos, availableFiles, cache = new Map()) {
  const trimmed = String(expression || '').trim()
  if (!trimmed) return null
  if (cache.has(trimmed)) return cache.get(trimmed)

  const literalValue = parseStaticLiteral(trimmed)
  if (literalValue !== null) {
    cache.set(trimmed, literalValue)
    return literalValue
  }

  if (trimmed.startsWith('`') && trimmed.endsWith('`')) {
    const inner = trimmed.slice(1, -1)
    const resolved = inner.replace(/\$\{([^}]+)\}/g, (_, expr) => {
      const value = resolveStaticExpression(expr, info, moduleInfos, availableFiles, cache)
      return value === null ? '__UNRESOLVED__' : value
    })
    if (resolved.includes('__UNRESOLVED__')) {
      cache.set(trimmed, null)
      return null
    }
    cache.set(trimmed, resolved)
    return resolved
  }

  const binding = info.constBindings.find((item) => item.name === trimmed)
  if (binding) {
    const value = resolveStaticExpression(binding.expression, info, moduleInfos, availableFiles, cache)
    cache.set(trimmed, value)
    return value
  }

  const memberMatch = /^([A-Za-z_$][\w$]*)\.prefixes\.(experimental|internal|vpsAgentWeb)$/.exec(trimmed)
  if (memberMatch) {
    const importedIdentifier = memberMatch[1]
    const prefixKey = memberMatch[2]
    const importEntry = info.imports.find((item) => item.localName === importedIdentifier)
    if (!importEntry) {
      cache.set(trimmed, null)
      return null
    }

    const targetFile = resolveLocalModule(info.file.path, importEntry.specifier, availableFiles)
    const targetInfo = targetFile ? moduleInfos.get(targetFile) : null
    const value = targetInfo?.routePrefixDefaults?.[prefixKey] || null
    cache.set(trimmed, value)
    return value
  }

  cache.set(trimmed, null)
  return null
}

function extractDeclaredRoutes(source, relativeFile) {
  const results = []
  const routeRegex = new RegExp(
    `\\b([A-Za-z_$][\\w$]*)\\.(${ROUTE_METHODS.join('|')})\\(\\s*${STATIC_STRING_TOKEN}`,
    'gm'
  )

  let match
  while ((match = routeRegex.exec(source)) !== null) {
    const declaredPath = readStaticStringMatch(match, 3)
    if (!declaredPath) continue

    results.push({
      framework: 'fastify',
      method: String(match[2] || '').toUpperCase(),
      path: declaredPath,
      file: relativeFile,
      line: indexToLine(source, match.index),
    })
  }

  return results
}

function resolveLocalModule(fromFile, specifier, availableFiles) {
  if (!specifier || !specifier.startsWith('.')) return null

  const fromDir = path.posix.dirname(String(fromFile).split(path.sep).join('/'))
  const base = path.posix.normalize(path.posix.join(fromDir, specifier))
  const extensionlessBase = base.replace(/\.(?:[cm]?js|jsx|tsx?|mts|cts)$/i, '')
  const candidates = [
    base,
    extensionlessBase,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${extensionlessBase}.ts`,
    `${extensionlessBase}.tsx`,
    `${extensionlessBase}.js`,
    `${extensionlessBase}.jsx`,
    `${extensionlessBase}.mjs`,
    `${extensionlessBase}.cjs`,
    path.posix.join(base, 'index.ts'),
    path.posix.join(base, 'index.tsx'),
    path.posix.join(base, 'index.js'),
    path.posix.join(base, 'index.jsx'),
    path.posix.join(base, 'index.mjs'),
    path.posix.join(base, 'index.cjs'),
    path.posix.join(extensionlessBase, 'index.ts'),
    path.posix.join(extensionlessBase, 'index.tsx'),
    path.posix.join(extensionlessBase, 'index.js'),
    path.posix.join(extensionlessBase, 'index.jsx'),
    path.posix.join(extensionlessBase, 'index.mjs'),
    path.posix.join(extensionlessBase, 'index.cjs'),
  ]

  return candidates
    .map((candidate) => candidate.replace(/\/{2,}/g, '/'))
    .find((candidate) => availableFiles.has(candidate)) || null
}

function resolveExportedModule(moduleFile, exportName, moduleInfos, availableFiles, seen = new Set()) {
  const visitKey = `${moduleFile}:${exportName}`
  if (seen.has(visitKey)) return null
  seen.add(visitKey)

  const info = moduleInfos.get(moduleFile)
  if (!info) return null

  const reexport = info.reexports.find((item) => item.exportName === exportName)
  if (!reexport) return moduleFile

  const nextFile = resolveLocalModule(moduleFile, reexport.source, availableFiles)
  if (!nextFile) return null
  if (reexport.exportKind === 'default') return nextFile
  return resolveExportedModule(nextFile, exportName, moduleInfos, availableFiles, seen) || nextFile
}

function resolveImportedModule(info, symbol, moduleInfos, availableFiles) {
  const importEntry = info.imports.find((item) => item.localName === symbol)
  if (!importEntry) return null

  const targetFile = resolveLocalModule(info.file.path, importEntry.specifier, availableFiles)
  if (!targetFile) return null
  if (importEntry.importKind === 'default') return targetFile

  return resolveExportedModule(targetFile, importEntry.importedName, moduleInfos, availableFiles) || targetFile
}

function inferRouteSourceTier(filePath) {
  const normalizedPath = String(filePath || '').split(path.sep).join('/')
  if (normalizedPath.includes('/routes/experimental/')) return 'experimental'
  if (normalizedPath.includes('/routes/vps-agent-web/')) return 'vps_agent_web'
  if (normalizedPath.includes('/routes/core/') || normalizedPath.includes('/plugins/health-check')) return 'core'
  return 'unknown'
}

function buildRouteEvidence(routePath, mountChain) {
  const lastMount = Array.isArray(mountChain) && mountChain.length > 0
    ? mountChain[mountChain.length - 1]
    : null
  return {
    level: 'runtime_like',
    sources: [
      'declared_route_literal',
      'register_chain_bound',
    ],
    tier: classifyRouteTier(routePath),
    activation: lastMount?.activation || classifyRouteActivation(routePath),
    mountDepth: Array.isArray(mountChain) ? mountChain.length : 0,
  }
}

function buildRouteDeclares(moduleInfos, deterministic) {
  const routeDeclares = []

  for (const info of moduleInfos.values()) {
    for (const declaredRoute of info.declaredRoutes) {
      routeDeclares.push({
        framework: 'fastify',
        level: 'declared',
        method: declaredRoute.method,
        path: declaredRoute.path,
        file: declaredRoute.file,
        line: declaredRoute.line,
        sourceTierHint: inferRouteSourceTier(declaredRoute.file),
      })
    }
  }

  if (deterministic) {
    routeDeclares.sort((a, b) => `${a.path}:${a.method}:${a.file}:${a.line}`.localeCompare(`${b.path}:${b.method}:${b.file}:${b.line}`))
  }

  return routeDeclares
}

function buildRouteMounts(moduleInfos, deterministic) {
  const availableFiles = new Set(moduleInfos.keys())
  const routeMounts = []

  for (const info of moduleInfos.values()) {
    for (const registration of info.registers) {
      const resolvedPrefix = resolveStaticExpression(
        registration.prefixExpression,
        info,
        moduleInfos,
        availableFiles
      )
      const targetFile = resolveImportedModule(info, registration.target, moduleInfos, availableFiles)
      const tierSource = resolvedPrefix || registration.prefixExpression || ''
      const guardActivation = classifyActivationFromGuard(registration.controlFlowGuard)
      const activation = guardActivation || classifyRouteActivation(tierSource)

      routeMounts.push({
        framework: 'fastify',
        level: 'bound',
        file: info.file.path,
        line: registration.line,
        target: registration.target,
        targetFile,
        prefixExpression: registration.prefixExpression || '',
        resolvedPrefix: resolvedPrefix || null,
        sourceTierHint: inferRouteSourceTier(info.file.path),
        tierHint: classifyRouteTier(tierSource),
        activation,
        controlFlowGuard: registration.controlFlowGuard,
      })
    }
  }

  if (deterministic) {
    routeMounts.sort((a, b) => `${a.file}:${a.target}:${a.resolvedPrefix || a.prefixExpression}:${a.line}`.localeCompare(`${b.file}:${b.target}:${b.resolvedPrefix || b.prefixExpression}:${b.line}`))
  }

  return routeMounts
}

function buildRouteBinds(moduleInfos, deterministic) {
  const availableFiles = new Set(moduleInfos.keys())
  const importedByCounts = new Map()

  for (const [moduleFile, info] of moduleInfos.entries()) {
    importedByCounts.set(moduleFile, importedByCounts.get(moduleFile) || 0)
    for (const importEntry of info.imports) {
      const targetFile = resolveLocalModule(moduleFile, importEntry.specifier, availableFiles)
      if (!targetFile) continue
      importedByCounts.set(targetFile, (importedByCounts.get(targetFile) || 0) + 1)
    }
  }

  const rootModules = [...moduleInfos.values()]
    .filter((info) => info.registers.length > 0 && (importedByCounts.get(info.file.path) || 0) === 0)
    .map((info) => info.file.path)

  const routeBinds = []
  const seen = new Set()

  function visit(moduleFile, prefix = '', mountChain = []) {
    const visitKey = `${moduleFile}|${prefix}|${mountChain.map((step) => `${step.file}:${step.target}:${step.prefix}`).join('>')}`
    if (seen.has(`visit:${visitKey}`)) return
    seen.add(`visit:${visitKey}`)

    const info = moduleInfos.get(moduleFile)
    if (!info) return

    for (const declaredRoute of info.declaredRoutes) {
      const resolvedPath = normalizeRoutePath(prefix, declaredRoute.path)
      const bind = {
        framework: 'fastify',
        binding: 'runtime_like',
        method: declaredRoute.method,
        path: resolvedPath,
        declaredPath: declaredRoute.path,
        file: declaredRoute.file,
        line: declaredRoute.line,
        via: mountChain,
        evidence: buildRouteEvidence(resolvedPath, mountChain),
      }
      const bindKey = `${bind.method}|${bind.path}|${bind.file}|${bind.line}|${JSON.stringify(bind.via)}`
      if (seen.has(bindKey)) continue
      seen.add(bindKey)
      routeBinds.push(bind)
    }

    for (const registration of info.registers) {
      const resolvedPrefix = resolveStaticExpression(
        registration.prefixExpression,
        info,
        moduleInfos,
        availableFiles
      )
      const targetFile = resolveImportedModule(info, registration.target, moduleInfos, availableFiles)
      if (!targetFile) continue
      const guardActivation = classifyActivationFromGuard(registration.controlFlowGuard)
      const activation = guardActivation || classifyRouteActivation(resolvedPrefix || registration.prefixExpression || '')
      visit(
        targetFile,
        normalizeRoutePath(prefix, resolvedPrefix || registration.prefixExpression || ''),
        [...mountChain, {
          file: info.file.path,
          target: registration.target,
          prefix: resolvedPrefix || registration.prefixExpression || '/',
          line: registration.line,
          activation,
          controlFlowGuard: registration.controlFlowGuard,
        }]
      )
    }
  }

  for (const rootModule of rootModules) {
    visit(rootModule, '', [])
  }

  if (deterministic) {
    routeBinds.sort((a, b) => `${a.path}:${a.method}:${a.file}:${a.line}`.localeCompare(`${b.path}:${b.method}:${b.file}:${b.line}`))
  }

  return routeBinds
}

function classifyFileRole(relativeFile) {
  const normalized = String(relativeFile).split(path.sep).join('/')
  if (/(^|\/)src\/admin\/app\/pages\//.test(normalized)) return 'page'
  if (/(^|\/)src\/admin\/app\/chat\/api-client\./.test(normalized)) return 'api_client'
  if (/(^|\/)src\/admin\/app\/utils\//.test(normalized)) return 'ui_helper'
  if (/(^|\/)src\/shared\/contracts\//.test(normalized)) return 'contract'
  if (/(^|\/)src\/routes\//.test(normalized)) return 'route'
  if (/(^|\/)src\/state\//.test(normalized)) return 'state'
  if (/(^|\/)src\/admin\/app\/components\//.test(normalized)) return 'component'
  if (/(^|\/)scripts\//.test(normalized)) return 'script'
  if (/(^|\/)test\//.test(normalized)) return 'test'
  return 'source'
}

function indexToLine(source, index) {
  if (!Number.isFinite(index) || index <= 0) return 1
  let line = 1
  for (let cursor = 0; cursor < index && cursor < source.length; cursor += 1) {
    if (source[cursor] === '\n') {
      line += 1
    }
  }
  return line
}

function extractWithPatterns(source, language, relativeFile, patterns) {
  const results = []
  const normalizedLanguage = String(language).toLowerCase()
  for (const pattern of patterns) {
    if (!pattern.languages.includes(normalizedLanguage)) continue
    pattern.regex.lastIndex = 0
    let match
    while ((match = pattern.regex.exec(source)) !== null) {
      const name = String(match[1] ?? '').trim()
      if (!name) continue
      results.push({
        kind: pattern.kind,
        value: name,
        file: relativeFile,
        line: indexToLine(source, match.index),
      })
    }
  }
  return results
}

async function extractFileFacts(file, rootDir) {
  const language = languageFromFilePath(file)
  if (!language) {
    return {
      file: {
        path: toPosixRelative(rootDir, file),
        language: null,
        role: classifyFileRole(toPosixRelative(rootDir, file)),
      },
      symbols: [],
      imports: [],
      declares: [],
      module: null,
    }
  }

  const source = await fs.readFile(file, 'utf-8')
  const relativeFile = toPosixRelative(rootDir, file)
  const normalizedLanguage = String(language).toLowerCase()

  const symbols = extractWithPatterns(source, normalizedLanguage, relativeFile, TEXT_SYMBOL_PATTERNS)
    .map((item) => ({
      name: item.value,
      kind: item.kind,
      file: item.file,
      line: item.line,
    }))

  const imports = extractWithPatterns(source, normalizedLanguage, relativeFile, TEXT_IMPORT_PATTERNS)
    .map((item) => ({
      from: relativeFile,
      to: item.value,
      kind: item.kind,
    }))

  const declares = symbols.map((item) => ({
    file: item.file,
    symbol: item.name,
    kind: item.kind,
  }))

  const module = ['typescript', 'javascript', 'tsx', 'jsx'].includes(normalizedLanguage)
    ? {
      file: {
        path: relativeFile,
      },
      imports: extractDetailedImports(source),
      reexports: extractDetailedReexports(source),
      constBindings: extractConstBindings(source),
      routePrefixDefaults: extractRoutePrefixDefaults(source),
      declaredRoutes: extractDeclaredRoutes(source, relativeFile),
      registers: extractRouteRegistrations(source),
    }
    : null

  return {
    file: {
      path: relativeFile,
      language: normalizedLanguage,
      role: classifyFileRole(relativeFile),
    },
    symbols,
    imports,
    declares,
    module,
  }
}
