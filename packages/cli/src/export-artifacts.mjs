import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  discoverFiles,
  languageFromFilePath,
  scan,
  toJsonLines,
} from '@los-ast/core'
import { classifyActivationFromGuard, extractRouteRegistrations } from './route-guard-analysis.mjs'
import { resolveRules, resolveWorkspace } from './workspace-options.mjs'

function toPosixRelative(rootDir, filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/')
}

function parseArgs(argv) {
  const args = {
    root: '',
    project: 'custom',
    include: [],
    ignore: [],
    rules: [],
    outputDir: '',
    deterministic: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] ?? '').trim()
    const next = String(argv[index + 1] ?? '').trim()
    if (token === '--root') {
      args.root = next
      index += 1
      continue
    }
    if (token === '--project') {
      args.project = next || args.project
      index += 1
      continue
    }
    if (token === '--include') {
      args.include.push(next)
      index += 1
      continue
    }
    if (token === '--ignore') {
      args.ignore.push(next)
      index += 1
      continue
    }
    if (token === '--rules') {
      args.rules.push(next)
      index += 1
      continue
    }
    if (token === '--output-dir') {
      args.outputDir = next
      index += 1
      continue
    }
    if (token === '--deterministic') {
      args.deterministic = true
    }
  }

  return args
}

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

function readStaticStringMatch(match, startIndex = 1) {
  for (let offset = 0; offset < 3; offset += 1) {
    const value = match[startIndex + offset]
    if (value !== undefined) {
      return value
    }
  }
  return ''
}

function normalizeRoutePath(prefix = '', routePath = '') {
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

function classifyRouteTier(routePath) {
  const normalizedPath = normalizeRoutePath('', routePath)
  if (normalizedPath.startsWith('/experimental')) return 'experimental'
  if (normalizedPath.startsWith('/internal')) return 'internal'
  if (normalizedPath.startsWith('/vps-agent-web')) return 'vps_agent_web'
  return 'core'
}

function inferRouteSourceTier(filePath) {
  const normalizedPath = String(filePath || '').split(path.sep).join('/')
  if (normalizedPath.includes('/routes/experimental/')) return 'experimental'
  if (normalizedPath.includes('/routes/vps-agent-web/')) return 'vps_agent_web'
  if (normalizedPath.includes('/routes/core/') || normalizedPath.includes('/plugins/health-check')) return 'core'
  return 'unknown'
}

function classifyRouteActivation(routePath) {
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

function normalizeComparableRoutePath(routePath) {
  const normalizedPath = normalizeRoutePath('', routePath)
  if (normalizedPath.length > 1) {
    return normalizedPath.replace(/\/+$/, '')
  }
  return normalizedPath
}

function buildRouteRuntimeDeltas(routeBinds, routeRuntime, deterministic) {
  const bindByKey = new Map()
  const bindByNormalizedKey = new Map()

  for (const bind of routeBinds) {
    const key = `${bind.method}:${bind.path}`
    if (!bindByKey.has(key)) {
      bindByKey.set(key, bind)
    }

    const normalizedKey = `${bind.method}:${normalizeComparableRoutePath(bind.path)}`
    if (!bindByNormalizedKey.has(normalizedKey)) {
      bindByNormalizedKey.set(normalizedKey, bind)
    }
  }

  const runtimeDeltas = routeRuntime.map((runtimeRoute) => {
    const reasons = []
    const exactKey = `${runtimeRoute.method}:${runtimeRoute.path}`
    const normalizedPath = normalizeComparableRoutePath(runtimeRoute.path)
    const normalizedKey = `${runtimeRoute.method}:${normalizedPath}`

    const exactBind = bindByKey.get(exactKey) || null
    const normalizedBind = bindByNormalizedKey.get(normalizedKey) || null
    let matchedBind = exactBind || normalizedBind

    if (exactBind) {
      return {
        method: runtimeRoute.method,
        path: runtimeRoute.path,
        relation: 'exact_match',
        reasons,
        matchedBind: {
          method: exactBind.method,
          path: exactBind.path,
          file: exactBind.file,
        },
      }
    }

    if (normalizedBind && normalizedBind.path !== runtimeRoute.path) {
      reasons.push('trailing_slash_variant')
    }

    if (runtimeRoute.method === 'HEAD') {
      const getBind = bindByNormalizedKey.get(`GET:${normalizedPath}`) || bindByKey.get(`GET:${runtimeRoute.path}`) || null
      if (getBind) {
        matchedBind = matchedBind || getBind
        reasons.push('auto_head')
        if (runtimeRoute.path !== normalizedPath && !reasons.includes('trailing_slash_variant')) {
          reasons.push('trailing_slash_variant')
        }
      }
    }

    return {
      method: runtimeRoute.method,
      path: runtimeRoute.path,
      relation: reasons.length > 0 ? 'runtime_variant' : 'runtime_only',
      reasons,
      matchedBind: matchedBind ? {
        method: matchedBind.method,
        path: matchedBind.path,
        file: matchedBind.file,
      } : null,
    }
  })

  if (deterministic) {
    runtimeDeltas.sort((a, b) => `${a.path}:${a.method}`.localeCompare(`${b.path}:${b.method}`))
  }

  return runtimeDeltas
}

async function probeLosAstApiRuntimeRoutes(rootDir, deterministic) {
  const distServer = path.join(rootDir, 'packages', 'api', 'dist', 'server.js')
  const distCoreIndex = path.join(rootDir, 'packages', 'api', 'dist', 'routes', 'core', 'index.js')
  const distExperimentalIndex = path.join(rootDir, 'packages', 'api', 'dist', 'routes', 'experimental', 'index.js')
  const distVpsIndex = path.join(rootDir, 'packages', 'api', 'dist', 'routes', 'vps-agent-web', 'index.js')
  const distHealthCheck = path.join(rootDir, 'packages', 'api', 'dist', 'plugins', 'health-check.js')
  const distCancellation = path.join(rootDir, 'packages', 'api', 'dist', 'plugins', 'cancellation.js')
  const distConfig = path.join(rootDir, 'packages', 'api', 'dist', 'config', 'index.js')

  const requiredFiles = [distServer, distCoreIndex, distExperimentalIndex, distVpsIndex, distHealthCheck, distCancellation, distConfig]
  for (const file of requiredFiles) {
    try {
      await fs.access(file)
    } catch {
      return []
    }
  }

  const FastifyModule = await import('fastify')
  const Fastify = FastifyModule.default
  const [
    { default: healthCheckPlugin },
    { default: cancellationPlugin },
    coreIndex,
    experimentalIndex,
    { default: vpsAgentWebRoutes },
    configModule,
  ] = await Promise.all([
    import(pathToFileURL(distHealthCheck).href),
    import(pathToFileURL(distCancellation).href),
    import(pathToFileURL(distCoreIndex).href),
    import(pathToFileURL(distExperimentalIndex).href),
    import(pathToFileURL(distVpsIndex).href),
    import(pathToFileURL(distConfig).href),
  ])

  const runtimeRoutes = []
  const app = Fastify({ logger: false })
  app.addHook('onRoute', (routeOptions) => {
    const methods = Array.isArray(routeOptions.method) ? routeOptions.method : [routeOptions.method]
    for (const method of methods) {
      runtimeRoutes.push({
        framework: 'fastify',
        level: 'runtime',
        probe: 'los_ast_api_dist_wiring_onRoute',
        method: String(method || '').toUpperCase(),
        path: routeOptions.url,
        routePath: routeOptions.routePath,
        prefix: routeOptions.prefix,
        tier: classifyRouteTier(routeOptions.url),
        activation: classifyRouteActivation(routeOptions.url),
      })
    }
  })

  try {
    await app.register(healthCheckPlugin)
    await app.register(cancellationPlugin)
    await app.register(coreIndex.scanRoutes, { prefix: '/scan' })
    await app.register(coreIndex.discoverRoutes, { prefix: '/discover' })

    const routeConfig = configModule.ROUTE_CONFIG || {}
    if (routeConfig.enableExperimental) {
      const experimentalPrefix = routeConfig.prefixes?.experimental || '/experimental'
      await app.register(experimentalIndex.memoryProposalsRoutes, { prefix: `${experimentalPrefix}/memory-proposals` })
      await app.register(experimentalIndex.incidentRoutes, { prefix: `${experimentalPrefix}/incidents` })
      await app.register(experimentalIndex.attributionRoutes, { prefix: `${experimentalPrefix}/attribution` })
      await app.register(experimentalIndex.recoveryRoutes, { prefix: `${experimentalPrefix}/recovery` })
      await app.register(experimentalIndex.approvalRoutes, { prefix: `${experimentalPrefix}/approvals` })
      await app.register(experimentalIndex.hotReloadRoutes, { prefix: `${experimentalPrefix}/hotreload` })
      await app.register(experimentalIndex.evidenceRoutes, { prefix: `${experimentalPrefix}/evidence` })
    }

    if (routeConfig.enableVpsAgentWeb) {
      const vpsPrefix = routeConfig.prefixes?.vpsAgentWeb || '/vps-agent-web'
      await app.register(vpsAgentWebRoutes, { prefix: vpsPrefix })
    }
    await app.ready()
  } finally {
    await app.close().catch(() => {})
  }

  const uniqueRoutes = []
  const seen = new Set()
  for (const route of runtimeRoutes) {
    const key = `${route.method}:${route.path}`
    if (seen.has(key)) continue
    seen.add(key)
    uniqueRoutes.push(route)
  }

  if (deterministic) {
    uniqueRoutes.sort((a, b) => `${a.path}:${a.method}`.localeCompare(`${b.path}:${b.method}`))
  }

  return uniqueRoutes
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

async function exportArtifacts(options) {
  const ws = await resolveWorkspace(options)
  const rules = await resolveRules(options)
  const outputDir = path.resolve(options.outputDir || path.join(ws.rootDir, 'logs', 'hub-lite-artifacts'))
  const deterministic = Boolean(options.deterministic)

  const scanResult = await scan({
    project: ws.project,
    rootDir: ws.rootDir,
    include: ws.include,
    ignore: ws.ignore,
    rules,
    deterministic,
  })

  const files = await discoverFiles({
    rootDir: ws.rootDir,
    include: ws.include,
    ignore: ws.ignore,
  })

  const structureFiles = []
  const structureSymbols = []
  const structureImports = []
  const structureDeclares = []
  const moduleInfos = new Map()
  for (const file of files) {
    const facts = await extractFileFacts(file, ws.rootDir)
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
  const routeRuntime = await probeLosAstApiRuntimeRoutes(ws.rootDir, deterministic)
  const routeRuntimeDeltas = buildRouteRuntimeDeltas(routeBinds, routeRuntime, deterministic)
  const routeRuntimeWithDeltas = routeRuntime.map((runtimeRoute) => ({
    ...runtimeRoute,
    delta: routeRuntimeDeltas.find((item) => item.method === runtimeRoute.method && item.path === runtimeRoute.path) || null,
  }))

  if (deterministic) {
    structureFiles.sort((a, b) => String(a.path).localeCompare(String(b.path)))
    structureSymbols.sort((a, b) => `${a.file}:${a.name}:${a.kind}`.localeCompare(`${b.file}:${b.name}:${b.kind}`))
    structureImports.sort((a, b) => `${a.from}:${a.to}:${a.kind}`.localeCompare(`${b.from}:${b.to}:${b.kind}`))
    structureDeclares.sort((a, b) => `${a.file}:${a.symbol}:${a.kind}`.localeCompare(`${b.file}:${b.symbol}:${b.kind}`))
  }

  const structureMap = {
    schema: 'lsclaw.los-ast.structure-map.v1',
    version: '1.0.0',
    project: ws.project,
    rootDir: ws.rootDir,
    generatedAt: deterministic ? '1970-01-01T00:00:00.000Z' : new Date().toISOString(),
    source: {
      tool: 'los-ast',
      mode: 'cli',
      scanArtifactPath: 'scan-findings.jsonl',
      symbolsArtifactPath: 'symbols.json',
    },
    files: structureFiles,
    symbols: structureSymbols,
    imports: structureImports,
    declares: structureDeclares,
    route_declares: routeDeclares,
    route_mounts: routeMounts,
    route_binds: routeBinds,
    route_runtime: routeRuntimeWithDeltas,
    route_runtime_deltas: routeRuntimeDeltas,
  }

  await fs.mkdir(outputDir, { recursive: true })
  await fs.writeFile(path.join(outputDir, 'scan-findings.jsonl'), toJsonLines(scanResult.findings, deterministic), 'utf-8')
  await fs.writeFile(path.join(outputDir, 'symbols.json'), `${JSON.stringify(structureSymbols, null, 2)}\n`, 'utf-8')
  await fs.writeFile(path.join(outputDir, 'structure-map.json'), `${JSON.stringify(structureMap, null, 2)}\n`, 'utf-8')

  const summary = {
    ok: true,
    project: ws.project,
    rootDir: ws.rootDir,
    outputDir,
    artifactPaths: {
      scanFindings: path.join(outputDir, 'scan-findings.jsonl'),
      symbols: path.join(outputDir, 'symbols.json'),
      structureMap: path.join(outputDir, 'structure-map.json'),
    },
    counts: {
      findings: scanResult.findings.length,
      files: structureFiles.length,
      symbols: structureSymbols.length,
      imports: structureImports.length,
      declares: structureDeclares.length,
      routeDeclares: routeDeclares.length,
      routeMounts: routeMounts.length,
      routeBinds: routeBinds.length,
      routeRuntime: routeRuntimeWithDeltas.length,
      routeRuntimeDeltas: routeRuntimeDeltas.length,
    },
    limitations: routeBinds.length > 0
      ? [
        'route_binds currently covers minimal Fastify literal-only route declarations and register prefixes',
      ]
      : [
        'route_binds currently covers minimal Fastify literal-only route declarations and register prefixes',
        'route_binds may remain empty when the workspace does not expose literal Fastify route registrations',
      ],
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.stdout.write(`Usage: node ./packages/cli/src/export-artifacts.mjs --root <dir> [options]

Options:
  --project <name>       project name for rule selection (default: custom)
  --include <glob>       include pattern, can be repeated
  --ignore <glob>        ignore pattern, can be repeated
  --rules <glob>         extra rule pattern, can be repeated
  --output-dir <dir>     output directory for generated artifacts
  --deterministic        stable timestamps and ordering
`)
  process.exit(0)
}

const args = parseArgs(process.argv.slice(2))
exportArtifacts(args).catch((error) => {
  process.stderr.write(`${error?.stack || error?.message || String(error)}\n`)
  process.exit(1)
})
