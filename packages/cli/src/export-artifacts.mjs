import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { getProjectAdapter, listProjects } from '@los-ast/adapters'
import {
  discoverFiles,
  languageFromFilePath,
  loadRuleFiles,
  scan,
  toJsonLines,
} from '@los-ast/core'

function normalizeArray(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.flatMap((v) => String(v).split(',')).map((s) => s.trim()).filter(Boolean)
  return String(value).split(',').map((s) => s.trim()).filter(Boolean)
}

function toPosixRelative(rootDir, filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/')
}

async function resolveWorkspace(options) {
  if (options.project && options.project !== 'custom' && !options.root) {
    const adapter = getProjectAdapter(options.project)
    return {
      project: adapter.project,
      rootDir: adapter.rootDir,
      include: normalizeArray(options.include).length ? normalizeArray(options.include) : adapter.include,
      ignore: normalizeArray(options.ignore).length ? normalizeArray(options.ignore) : adapter.ignore,
      ruleGlobs: adapter.ruleGlobs,
    }
  }

  if (options.root) {
    const project = options.project || 'custom'
    return {
      project,
      rootDir: path.resolve(options.root),
      include: normalizeArray(options.include),
      ignore: normalizeArray(options.ignore),
      ruleGlobs: [
        'rules/languages/**/*.yml',
        'rules/languages/**/*.yaml',
        `rules/projects/${project}/**/*.yml`,
        `rules/projects/${project}/**/*.yaml`,
      ],
    }
  }

  throw new Error(`missing required option: --root (or use --project ${listProjects().join('|')})`)
}

async function resolveRules(options) {
  const ws = await resolveWorkspace(options)
  const explicitPatterns = normalizeArray(options.rules)
  return loadRuleFiles([...ws.ruleGlobs, ...explicitPatterns])
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
const STATIC_STRING_OR_EXPR_TOKEN = "(`(?:[^`\\\\]|\\\\.|\\$\\{[^}]+\\})*`|\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'|[A-Za-z_$][\\w$.]*)"

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

function findMatchingBrace(source, openBraceIndex) {
  if (openBraceIndex < 0 || source[openBraceIndex] !== '{') return -1
  let depth = 0
  for (let index = openBraceIndex; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

function stripWrappingParens(expression) {
  let normalized = String(expression || '').trim()
  while (normalized.startsWith('(') && normalized.endsWith(')')) {
    let depth = 0
    let balanced = true
    for (let index = 0; index < normalized.length; index += 1) {
      const char = normalized[index]
      if (char === '(') depth += 1
      if (char === ')') {
        depth -= 1
        if (depth === 0 && index < normalized.length - 1) {
          balanced = false
          break
        }
      }
    }
    if (!balanced || depth !== 0) break
    normalized = normalized.slice(1, -1).trim()
  }
  return normalized
}

function invertBooleanExpression(expression) {
  const normalized = stripWrappingParens(expression)
  if (!normalized) return ''

  const andTerms = splitTopLevelLogical(normalized, '&&')
  if (andTerms.length > 1) {
    return andTerms
      .map((term) => formatBooleanTermForJoin(invertBooleanExpression(term), '||'))
      .join(' || ')
  }

  const orTerms = splitTopLevelLogical(normalized, '||')
  if (orTerms.length > 1) {
    return orTerms
      .map((term) => formatBooleanTermForJoin(invertBooleanExpression(term), '&&'))
      .join(' && ')
  }

  if (normalized.startsWith('!')) {
    return stripWrappingParens(normalized.slice(1))
  }

  return `!${normalized}`
}

function formatBooleanTermForJoin(term, joinOperator) {
  const normalized = stripWrappingParens(term)
  if (!normalized) return ''
  if (joinOperator === '&&' && splitTopLevelLogical(normalized, '||').length > 1) {
    return `(${normalized})`
  }
  return normalized
}

function readArrowParamsRaw(match, startIndex = 2) {
  const parenParams = String(match[startIndex] || '').trim()
  if (parenParams) return parenParams
  return String(match[startIndex + 1] || '').trim()
}

function extractFunctionScopes(source) {
  const scopes = []
  const functionRegex = /(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*(?::\s*[^{]+)?\{/gm
  const arrowFunctionRegex = /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(([^)]*)\)|([A-Za-z_$][\w$]*))\s*=>\s*(?::\s*[^{=]+)?\{/gm

  let match
  while ((match = functionRegex.exec(source)) !== null) {
    const openBraceIndex = functionRegex.lastIndex - 1
    const endIndex = findMatchingBrace(source, openBraceIndex)
    if (endIndex === -1) continue

    scopes.push({
      name: String(match[1] || '').trim(),
      paramsRaw: String(match[2] || '').trim(),
      start: match.index,
      bodyStart: openBraceIndex,
      end: endIndex,
      line: indexToLine(source, match.index),
    })
  }

  while ((match = arrowFunctionRegex.exec(source)) !== null) {
    const openBraceIndex = arrowFunctionRegex.lastIndex - 1
    const endIndex = findMatchingBrace(source, openBraceIndex)
    if (endIndex === -1) continue

    scopes.push({
      name: String(match[1] || '').trim(),
      paramsRaw: readArrowParamsRaw(match),
      start: match.index,
      bodyStart: openBraceIndex,
      end: endIndex,
      line: indexToLine(source, match.index),
    })
  }

  scopes.sort((a, b) => a.start - b.start)

  return scopes
}

function splitTopLevelArguments(segment) {
  const input = String(segment || '').trim()
  if (!input) return []

  const parts = []
  let current = ''
  let depth = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let inTemplate = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    const next = input[index + 1]
    const prev = input[index - 1]

    if (inSingleQuote) {
      current += char
      if (char === "'" && prev !== '\\') inSingleQuote = false
      continue
    }

    if (inDoubleQuote) {
      current += char
      if (char === '"' && prev !== '\\') inDoubleQuote = false
      continue
    }

    if (inTemplate) {
      current += char
      if (char === '`' && prev !== '\\') {
        inTemplate = false
        continue
      }
      if (char === '$' && next === '{') {
        depth += 1
        current += next
        index += 1
        continue
      }
      if (char === '{' && depth > 0) {
        depth += 1
        continue
      }
      if (char === '}' && depth > 0) {
        depth -= 1
      }
      continue
    }

    if (char === "'") {
      inSingleQuote = true
      current += char
      continue
    }

    if (char === '"') {
      inDoubleQuote = true
      current += char
      continue
    }

    if (char === '`') {
      inTemplate = true
      current += char
      continue
    }

    if (char === '(' || char === '{' || char === '[') {
      depth += 1
      current += char
      continue
    }

    if (char === ')' || char === '}' || char === ']') {
      depth = Math.max(0, depth - 1)
      current += char
      continue
    }

    if (depth === 0 && char === ',') {
      parts.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  if (current.trim()) parts.push(current.trim())
  return parts
}

function parseParameterNames(paramsRaw) {
  return splitTopLevelArguments(paramsRaw)
    .map((param) => String(param || '').trim())
    .filter(Boolean)
    .map((param) => {
      const withoutDefault = param.split('=').map((part) => part.trim())[0]
      const withoutType = withoutDefault.split(':').map((part) => part.trim())[0]
      const cleaned = withoutType.replace(/^\.{3}/, '').trim()
      return /^[A-Za-z_$][\w$]*$/.test(cleaned) ? cleaned : null
    })
    .filter(Boolean)
}

function stripComments(source) {
  return String(source || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

function isSafeBooleanHelperExpression(expression, params) {
  const sanitized = stripComments(expression)
    .replace(/'(?:[^'\\]|\\.)*'/g, ' ')
    .replace(/"(?:[^"\\]|\\.)*"/g, ' ')
    .replace(/`(?:[^`\\]|\\.)*`/g, ' ')
    .trim()

  if (!sanitized) return false
  if (/\b(?:await|new|function)\b/.test(sanitized)) return false
  if (/=>/.test(sanitized)) return false
  if (/\?\s*[^:]+:/.test(sanitized)) return false
  if (/\b[A-Za-z_$][\w$]*\s*\(/.test(sanitized)) return false

  const normalized = sanitized
    .replace(/ROUTE_CONFIG\.(enableExperimental|enableInternal|enableVpsAgentWeb)\b/g, ' ')
    .replace(/\b(?:true|false|null|undefined)\b/g, ' ')

  const identifiers = normalized.match(/[A-Za-z_$][\w$]*/g) || []
  return identifiers.every((identifier) => params.includes(identifier))
}

function splitTopLevelStatements(source) {
  const statements = []
  let current = ''
  let parenDepth = 0
  let bracketDepth = 0
  let braceDepth = 0
  let templateDepth = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let inTemplate = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]
    const prev = source[index - 1]

    if (inSingleQuote) {
      current += char
      if (char === "'" && prev !== '\\') inSingleQuote = false
      continue
    }

    if (inDoubleQuote) {
      current += char
      if (char === '"' && prev !== '\\') inDoubleQuote = false
      continue
    }

    if (inTemplate) {
      current += char
      if (char === '`' && prev !== '\\' && templateDepth === 0) {
        inTemplate = false
        continue
      }
      if (char === '$' && next === '{') {
        templateDepth += 1
        current += next
        index += 1
        continue
      }
      if (char === '{' && templateDepth > 0) {
        templateDepth += 1
        continue
      }
      if (char === '}' && templateDepth > 0) {
        templateDepth -= 1
      }
      continue
    }

    if (char === "'") {
      inSingleQuote = true
      current += char
      continue
    }

    if (char === '"') {
      inDoubleQuote = true
      current += char
      continue
    }

    if (char === '`') {
      inTemplate = true
      current += char
      continue
    }

    if (char === '(') {
      parenDepth += 1
      current += char
      continue
    }

    if (char === ')') {
      parenDepth = Math.max(0, parenDepth - 1)
      current += char
      continue
    }

    if (char === '[') {
      bracketDepth += 1
      current += char
      continue
    }

    if (char === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1)
      current += char
      continue
    }

    if (char === '{') {
      braceDepth += 1
      current += char
      continue
    }

    if (char === '}') {
      braceDepth = Math.max(0, braceDepth - 1)
      current += char
      continue
    }

    if (parenDepth === 0 && bracketDepth === 0 && braceDepth === 0 && (char === ';' || char === '\n')) {
      if (current.trim()) {
        statements.push(current.trim())
      }
      current = ''
      continue
    }

    current += char
  }

  if (current.trim()) {
    statements.push(current.trim())
  }

  return statements
}

function extractSafeHelperExpression(body, params, helperFunctions = new Map()) {
  const statements = splitTopLevelStatements(body).filter(Boolean)
  if (statements.length === 0) return null

  const localAliases = new Map()
  const helperMap = helperFunctions instanceof Map ? helperFunctions : new Map()

  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index]
    const isLast = index === statements.length - 1

    if (isLast) {
      const returnMatch = /^return\s+([\s\S]+)$/.exec(statement)
      if (!returnMatch) return null

      const resolvedExpression = resolveGuardCondition(returnMatch[1], localAliases, helperMap)
      return isSafeBooleanHelperExpression(resolvedExpression, params)
        ? resolvedExpression
        : null
    }

    const aliasMatch = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([\s\S]+)$/.exec(statement)
    if (!aliasMatch) return null

    const aliasName = String(aliasMatch[1] || '').trim()
    const aliasExpression = String(aliasMatch[2] || '').trim()
    if (!aliasName || !aliasExpression) return null

    const resolvedAlias = resolveGuardCondition(aliasExpression, localAliases, helperMap)
    if (!isSafeBooleanHelperExpression(resolvedAlias, params)) return null
    localAliases.set(aliasName, resolvedAlias)
  }

  return null
}

function extractExpressionBodyHelpers(source) {
  const helpers = []
  const arrowExpressionRegex = /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(([^)]*)\)|([A-Za-z_$][\w$]*))\s*=>\s*(?!\{)([^;\n]+);?/gm
  let match

  while ((match = arrowExpressionRegex.exec(source)) !== null) {
    const expression = String(match[4] || '').trim()
    if (!expression || expression.startsWith('{')) {
      continue
    }

    helpers.push({
      name: String(match[1] || '').trim(),
      paramsRaw: readArrowParamsRaw(match),
      expression,
      line: indexToLine(source, match.index),
    })
  }

  return helpers
}

function extractBooleanHelperFunctions(source, functionScopes) {
  const helpers = new Map()
  const remainingScopes = [...functionScopes]
  const remainingExpressionHelpers = extractExpressionBodyHelpers(source)

  for (let pass = 0; pass < functionScopes.length + remainingExpressionHelpers.length; pass += 1) {
    let addedInPass = false

    for (let index = remainingScopes.length - 1; index >= 0; index -= 1) {
      const scope = remainingScopes[index]
      const params = parseParameterNames(scope.paramsRaw)
      if (params.length === 0) {
        remainingScopes.splice(index, 1)
        continue
      }

      const body = stripComments(source.slice(scope.bodyStart + 1, scope.end)).trim()
      const expression = extractSafeHelperExpression(body, params, helpers)
      if (!expression) continue

      helpers.set(scope.name, {
        params,
        expression,
      })
      remainingScopes.splice(index, 1)
      addedInPass = true
    }

    for (let index = remainingExpressionHelpers.length - 1; index >= 0; index -= 1) {
      const helperScope = remainingExpressionHelpers[index]
      const params = parseParameterNames(helperScope.paramsRaw)
      if (params.length === 0) {
        remainingExpressionHelpers.splice(index, 1)
        continue
      }

      const expression = resolveGuardCondition(helperScope.expression, new Map(), helpers)
      if (!isSafeBooleanHelperExpression(expression, params)) {
        continue
      }

      helpers.set(helperScope.name, {
        params,
        expression,
      })
      remainingExpressionHelpers.splice(index, 1)
      addedInPass = true
    }

    if (!addedInPass) break
  }

  return helpers
}

function replaceParameterReferences(expression, params, args) {
  let substituted = String(expression || '')

  for (let index = 0; index < params.length; index += 1) {
    const param = params[index]
    const arg = String(args[index] || '').trim()
    if (!param || !arg) return null

    const replacement = /^(?:[A-Za-z_$][\w$]*|ROUTE_CONFIG\.[A-Za-z_$][\w$]*|\([^)]*\))$/.test(arg)
      ? arg
      : `(${arg})`
    substituted = substituted.replace(new RegExp(`\\b${param}\\b`, 'g'), replacement)
  }

  return substituted
}

function parseSimpleCallExpression(expression) {
  const trimmed = stripWrappingParens(expression)
  const callMatch = /^([A-Za-z_$][\w$]*)\(([\s\S]*)\)$/.exec(trimmed)
  if (!callMatch) return null

  return {
    callee: String(callMatch[1] || '').trim(),
    args: splitTopLevelArguments(String(callMatch[2] || '').trim()),
  }
}

function resolveGuardCondition(condition, aliases, helperFunctions = new Map()) {
  let resolved = stripWrappingParens(condition)
  const aliasMap = aliases instanceof Map ? aliases : new Map()
  const helperMap = helperFunctions instanceof Map ? helperFunctions : new Map()

  for (let step = 0; step < 8; step += 1) {
    const previous = resolved
    const stripped = stripWrappingParens(resolved)
    const andTerms = splitTopLevelLogical(stripped, '&&')
    if (andTerms.length > 1) {
      const resolvedTerms = andTerms.map((term) => resolveGuardCondition(term, aliasMap, helperMap))
      const joined = joinGuardConditions(resolvedTerms)
      if (joined && joined !== previous) {
        resolved = joined
        continue
      }
    }

    const orTerms = splitTopLevelLogical(stripped, '||')
    if (orTerms.length > 1) {
      const resolvedTerms = orTerms.map((term) => resolveGuardCondition(term, aliasMap, helperMap))
      const joined = resolvedTerms.join(' || ')
      if (joined && joined !== previous) {
        resolved = joined
        continue
      }
    }

    const negatedExpressionMatch = /^!\s*\(([\s\S]+)\)$/.exec(stripped)
    if (negatedExpressionMatch) {
      const innerExpression = stripWrappingParens(negatedExpressionMatch[1])
      if (innerExpression) {
        const resolvedInner = resolveGuardCondition(innerExpression, aliasMap, helperMap)
        const inverted = invertBooleanExpression(resolvedInner)
        if (inverted && inverted !== previous) {
          resolved = inverted
          continue
        }
      }
    }

    const normalized = stripWrappingParens(resolved).replace(/\s+/g, '')
    const negatedAliasMatch = /^!([A-Za-z_$][\w$]*)$/.exec(normalized)
    if (negatedAliasMatch) {
      const aliasValue = aliasMap.get(negatedAliasMatch[1])
      if (aliasValue) {
        resolved = invertBooleanExpression(aliasValue)
        if (resolved !== previous) continue
      }
    }

    const aliasMatch = /^([A-Za-z_$][\w$]*)$/.exec(normalized)
    if (aliasMatch) {
      const aliasValue = aliasMap.get(aliasMatch[1])
      if (aliasValue) {
        resolved = stripWrappingParens(aliasValue)
      }
    }

    const negatedCallMatch = /^!([\s\S]+)$/.exec(stripWrappingParens(resolved))
    if (negatedCallMatch) {
      const parsedCall = parseSimpleCallExpression(negatedCallMatch[1])
      const helper = parsedCall ? helperMap.get(parsedCall.callee) : null
      if (helper && helper.params.length === parsedCall.args.length) {
        const substituted = replaceParameterReferences(helper.expression, helper.params, parsedCall.args)
        if (substituted) {
          resolved = invertBooleanExpression(substituted)
          if (resolved !== previous) continue
        }
      }
    }

    const parsedCall = parseSimpleCallExpression(resolved)
    const helper = parsedCall ? helperMap.get(parsedCall.callee) : null
    if (helper && helper.params.length === parsedCall.args.length) {
      const substituted = replaceParameterReferences(helper.expression, helper.params, parsedCall.args)
      if (substituted) {
        resolved = stripWrappingParens(substituted)
      }
    }

    if (resolved === previous) break
  }

  return stripWrappingParens(resolved)
}

function extractFunctionFlagAliases(source, functionScopes) {
  const aliasesByFunction = new Map()
  const helperFunctions = extractBooleanHelperFunctions(source, functionScopes)

  for (const scope of functionScopes) {
    const aliasMap = new Map()
    const scopeSource = source.slice(scope.bodyStart + 1, scope.end)
    const aliasRegex = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+);?/gm

    let match
    while ((match = aliasRegex.exec(scopeSource)) !== null) {
      const aliasName = String(match[1] || '').trim()
      const expression = String(match[2] || '').trim()
      const resolvedExpression = resolveGuardCondition(expression, aliasMap, helperFunctions)
      const normalizedExpression = resolvedExpression.replace(/\s+/g, '')
      if (!/^!?ROUTE_CONFIG\.(enableExperimental|enableInternal|enableVpsAgentWeb)$/.test(normalizedExpression)) {
        continue
      }
      aliasMap.set(aliasName, resolvedExpression)
    }

    aliasesByFunction.set(scope.name, aliasMap)
  }

  return aliasesByFunction
}

function extractControlFlowGuards(source, functionScopes) {
  const guards = []
  const helperFunctions = extractBooleanHelperFunctions(source, functionScopes)
  const aliasesByFunction = extractFunctionFlagAliases(source, functionScopes)

  for (const scope of functionScopes) {
    const aliases = aliasesByFunction.get(scope.name) || new Map()
    const inheritedConditionsByIfStart = new Map()

    for (const statement of extractIfStatements(source, scope.bodyStart + 1, scope.end)) {
      const ifStart = statement.ifStart
      const openBraceIndex = statement.blockStart
      const endIndex = findMatchingBrace(source, openBraceIndex)
      if (endIndex === -1 || endIndex > scope.end) continue

      const condition = statement.condition
      const resolvedCondition = resolveGuardCondition(condition, aliases, helperFunctions)
      const inheritedConditions = inheritedConditionsByIfStart.get(ifStart) || []
      const blockEffectiveCondition = joinGuardConditions([...inheritedConditions, resolvedCondition])
      const hasReturn = hasTopLevelReturnInBlock(source, openBraceIndex, endIndex)
      const elseContinuation = findElseContinuation(source, endIndex, scope.end)
      const elseHasReturn = elseContinuation?.kind === 'else_block'
        ? hasTopLevelReturnInBlock(source, elseContinuation.blockStart, elseContinuation.end)
        : false

      guards.push({
        functionName: scope.name,
        guardKind: 'block',
        branch: 'if',
        condition,
        resolvedCondition,
        effectiveCondition: blockEffectiveCondition,
        start: ifStart,
        blockStart: openBraceIndex,
        end: endIndex,
        line: indexToLine(source, ifStart),
      })

      if (elseContinuation?.kind === 'else_block') {
        guards.push({
          functionName: scope.name,
          guardKind: 'block',
          branch: 'else',
          condition,
          resolvedCondition,
          effectiveCondition: joinGuardConditions([...inheritedConditions, invertBooleanExpression(resolvedCondition)]),
          start: ifStart,
          blockStart: elseContinuation.blockStart,
          end: elseContinuation.end,
          line: elseContinuation.line,
        })
      }

      if (elseContinuation?.kind === 'else_if') {
        inheritedConditionsByIfStart.set(
          elseContinuation.ifStart,
          [...inheritedConditions, invertBooleanExpression(resolvedCondition)]
        )
      }

      if (!elseContinuation && hasReturn) {
        guards.push({
          functionName: scope.name,
          guardKind: 'early_return',
          branch: 'after_if',
          condition,
          resolvedCondition,
          effectiveCondition: joinGuardConditions([...inheritedConditions, invertBooleanExpression(resolvedCondition)]),
          start: ifStart,
          blockStart: openBraceIndex,
          end: endIndex,
          line: indexToLine(source, ifStart),
        })
      }

      if (elseContinuation?.kind === 'else_block' && hasReturn && !elseHasReturn) {
        guards.push({
          functionName: scope.name,
          guardKind: 'early_return',
          branch: 'after_if_else',
          condition,
          resolvedCondition,
          effectiveCondition: joinGuardConditions([...inheritedConditions, invertBooleanExpression(resolvedCondition)]),
          start: ifStart,
          blockStart: openBraceIndex,
          end: elseContinuation.end,
          line: elseContinuation.line,
        })
      }

      if (elseContinuation?.kind === 'else_block' && !hasReturn && elseHasReturn) {
        guards.push({
          functionName: scope.name,
          guardKind: 'early_return',
          branch: 'after_if_else',
          condition,
          resolvedCondition,
          effectiveCondition: joinGuardConditions([...inheritedConditions, resolvedCondition]),
          start: ifStart,
          blockStart: openBraceIndex,
          end: elseContinuation.end,
          line: elseContinuation.line,
        })
      }
    }
  }

  return guards
}

function extractIfStatements(source, startIndex, endIndex) {
  const statements = []
  let index = startIndex
  let inSingleQuote = false
  let inDoubleQuote = false
  let inTemplate = false
  let inLineComment = false
  let inBlockComment = false

  while (index < endIndex) {
    const char = source[index]
    const next = source[index + 1]
    const prev = source[index - 1]

    if (inLineComment) {
      if (char === '\n') inLineComment = false
      index += 1
      continue
    }

    if (inBlockComment) {
      if (prev === '*' && char === '/') inBlockComment = false
      index += 1
      continue
    }

    if (inSingleQuote) {
      if (char === "'" && prev !== '\\') inSingleQuote = false
      index += 1
      continue
    }

    if (inDoubleQuote) {
      if (char === '"' && prev !== '\\') inDoubleQuote = false
      index += 1
      continue
    }

    if (inTemplate) {
      if (char === '`' && prev !== '\\') {
        inTemplate = false
      }
      index += 1
      continue
    }

    if (char === '/' && next === '/') {
      inLineComment = true
      index += 2
      continue
    }

    if (char === '/' && next === '*') {
      inBlockComment = true
      index += 2
      continue
    }

    if (char === "'") {
      inSingleQuote = true
      index += 1
      continue
    }

    if (char === '"') {
      inDoubleQuote = true
      index += 1
      continue
    }

    if (char === '`') {
      inTemplate = true
      index += 1
      continue
    }

    if (
      char === 'i'
      && next === 'f'
      && !(prev && /[A-Za-z0-9_$]/.test(prev))
      && !(source[index + 2] && /[A-Za-z0-9_$]/.test(source[index + 2]))
    ) {
      const openParenIndex = skipWhitespaceAndComments(source, index + 2, endIndex)
      if (source[openParenIndex] !== '(') {
        index += 1
        continue
      }

      const closeParenIndex = findMatchingParen(source, openParenIndex, endIndex)
      if (closeParenIndex === -1) {
        index += 1
        continue
      }

      const blockStart = skipWhitespaceAndComments(source, closeParenIndex + 1, endIndex)
      if (source[blockStart] !== '{') {
        index = closeParenIndex + 1
        continue
      }

      statements.push({
        ifStart: index,
        condition: source.slice(openParenIndex + 1, closeParenIndex).trim(),
        blockStart,
        line: indexToLine(source, index),
      })

      index = blockStart + 1
      continue
    }

    index += 1
  }

  return statements
}

function findMatchingParen(source, openParenIndex, endIndex = source.length) {
  if (openParenIndex < 0 || source[openParenIndex] !== '(') return -1

  let depth = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let inTemplate = false
  let inLineComment = false
  let inBlockComment = false

  for (let index = openParenIndex; index < endIndex; index += 1) {
    const char = source[index]
    const next = source[index + 1]
    const prev = source[index - 1]

    if (inLineComment) {
      if (char === '\n') inLineComment = false
      continue
    }

    if (inBlockComment) {
      if (prev === '*' && char === '/') inBlockComment = false
      continue
    }

    if (inSingleQuote) {
      if (char === "'" && prev !== '\\') inSingleQuote = false
      continue
    }

    if (inDoubleQuote) {
      if (char === '"' && prev !== '\\') inDoubleQuote = false
      continue
    }

    if (inTemplate) {
      if (char === '`' && prev !== '\\') inTemplate = false
      continue
    }

    if (char === '/' && next === '/') {
      inLineComment = true
      index += 1
      continue
    }

    if (char === '/' && next === '*') {
      inBlockComment = true
      index += 1
      continue
    }

    if (char === "'") {
      inSingleQuote = true
      continue
    }

    if (char === '"') {
      inDoubleQuote = true
      continue
    }

    if (char === '`') {
      inTemplate = true
      continue
    }

    if (char === '(') depth += 1
    if (char === ')') {
      depth -= 1
      if (depth === 0) return index
    }
  }

  return -1
}

function skipWhitespaceAndComments(source, startIndex, endIndex = source.length) {
  let index = startIndex
  while (index < endIndex) {
    const char = source[index]
    const next = source[index + 1]
    if (/\s/.test(char)) {
      index += 1
      continue
    }
    if (char === '/' && next === '/') {
      index += 2
      while (index < endIndex && source[index] !== '\n') index += 1
      continue
    }
    if (char === '/' && next === '*') {
      index += 2
      while (index + 1 < endIndex && !(source[index] === '*' && source[index + 1] === '/')) {
        index += 1
      }
      index = Math.min(endIndex, index + 2)
      continue
    }
    break
  }
  return index
}

function findElseContinuation(source, ifEndIndex, scopeEnd) {
  let cursor = skipWhitespaceAndComments(source, ifEndIndex + 1, scopeEnd + 1)
  if (!source.startsWith('else', cursor)) return null

  const before = source[cursor - 1] || ''
  const after = source[cursor + 4] || ''
  if ((before && /[A-Za-z0-9_$]/.test(before)) || (after && /[A-Za-z0-9_$]/.test(after))) {
    return null
  }

  cursor = skipWhitespaceAndComments(source, cursor + 4, scopeEnd + 1)
  if (source.startsWith('if', cursor)) {
    return {
      kind: 'else_if',
      ifStart: cursor,
      line: indexToLine(source, cursor),
    }
  }
  if (source[cursor] !== '{') return null

  const end = findMatchingBrace(source, cursor)
  if (end === -1 || end > scopeEnd) return null

  return {
    kind: 'else_block',
    blockStart: cursor,
    end,
    line: indexToLine(source, cursor),
  }
}

function joinGuardConditions(conditions) {
  const normalizedParts = conditions
    .map((condition) => normalizeGuardExpression(condition))
    .filter(Boolean)

  if (normalizedParts.length === 0) return ''
  if (normalizedParts.length === 1) return normalizedParts[0]

  return normalizedParts
    .map((part) => {
      if (part.includes('&&') || part.includes('||')) return `(${part})`
      return part
    })
    .join(' && ')
}

function normalizeGuardExpression(expression) {
  const normalized = stripWrappingParens(expression)
  if (!normalized) return ''

  const andTerms = splitTopLevelLogical(normalized, '&&')
  if (andTerms.length > 1) {
    return andTerms.map((term) => stripWrappingParens(term)).join(' && ')
  }

  const orTerms = splitTopLevelLogical(normalized, '||')
  if (orTerms.length > 1) {
    return orTerms.map((term) => stripWrappingParens(term)).join(' || ')
  }

  return normalized
}

function hasTopLevelReturnInBlock(source, openBraceIndex, endIndex) {
  const blockSource = source.slice(openBraceIndex + 1, endIndex)
  let depth = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let inTemplate = false
  let inLineComment = false
  let inBlockComment = false

  for (let index = 0; index < blockSource.length; index += 1) {
    const char = blockSource[index]
    const next = blockSource[index + 1]
    const prev = blockSource[index - 1]

    if (inLineComment) {
      if (char === '\n') inLineComment = false
      continue
    }

    if (inBlockComment) {
      if (prev === '*' && char === '/') inBlockComment = false
      continue
    }

    if (inSingleQuote) {
      if (char === "'" && prev !== '\\') inSingleQuote = false
      continue
    }

    if (inDoubleQuote) {
      if (char === '"' && prev !== '\\') inDoubleQuote = false
      continue
    }

    if (inTemplate) {
      if (char === '`' && prev !== '\\') {
        inTemplate = false
        continue
      }
      if (char === '$' && next === '{') {
        depth += 1
        index += 1
        continue
      }
      if (char === '}' && depth > 0) {
        depth -= 1
      }
      continue
    }

    if (char === '/' && next === '/') {
      inLineComment = true
      index += 1
      continue
    }

    if (char === '/' && next === '*') {
      inBlockComment = true
      index += 1
      continue
    }

    if (char === "'") {
      inSingleQuote = true
      continue
    }

    if (char === '"') {
      inDoubleQuote = true
      continue
    }

    if (char === '`') {
      inTemplate = true
      continue
    }

    if (char === '{') {
      depth += 1
      continue
    }

    if (char === '}') {
      depth = Math.max(0, depth - 1)
      continue
    }

    if (depth !== 0) continue

    if (/\s/.test(char)) continue

    if (/[A-Za-z_$]/.test(char)) {
      const wordMatch = /^[A-Za-z_$][\w$]*/.exec(blockSource.slice(index))
      const word = wordMatch ? wordMatch[0] : ''
      if (word === 'return') return true
      index += Math.max(0, word.length - 1)
    }
  }

  return false
}

function findEnclosingFunction(functionScopes, index) {
  const scope = functionScopes
    .filter((item) => item.start <= index && index <= item.end)
    .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0]
  return scope || null
}

function findGuardForIndex(guards, functionName, index) {
  return guards
    .filter((guard) => {
      if (guard.functionName !== functionName) return false
      if (guard.guardKind === 'block') {
        return guard.blockStart <= index && index <= guard.end
      }
      return guard.end < index
    })
    .sort((a, b) => {
      if (b.start !== a.start) return b.start - a.start
      if (a.guardKind === b.guardKind) return 0
      return a.guardKind === 'block' ? -1 : 1
    })[0] || null
}

function splitTopLevelLogical(expression, operator) {
  const normalized = String(expression || '').trim()
  if (!normalized) return []

  const parts = []
  let current = ''
  let depth = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let inTemplate = false

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]
    const next = normalized[index + 1]
    const prev = normalized[index - 1]

    if (inSingleQuote) {
      current += char
      if (char === "'" && prev !== '\\') inSingleQuote = false
      continue
    }

    if (inDoubleQuote) {
      current += char
      if (char === '"' && prev !== '\\') inDoubleQuote = false
      continue
    }

    if (inTemplate) {
      current += char
      if (char === '`' && prev !== '\\' && depth === 0) {
        inTemplate = false
        continue
      }
      if (char === '$' && next === '{') {
        depth += 1
        current += next
        index += 1
        continue
      }
      if (char === '{' && depth > 0) {
        depth += 1
        continue
      }
      if (char === '}' && depth > 0) {
        depth -= 1
      }
      continue
    }

    if (char === "'") {
      inSingleQuote = true
      current += char
      continue
    }

    if (char === '"') {
      inDoubleQuote = true
      current += char
      continue
    }

    if (char === '`') {
      inTemplate = true
      current += char
      continue
    }

    if (char === '(') {
      depth += 1
      current += char
      continue
    }

    if (char === ')') {
      depth = Math.max(0, depth - 1)
      current += char
      continue
    }

    if (depth === 0 && char === operator[0] && next === operator[1]) {
      parts.push(current.trim())
      current = ''
      index += 1
      continue
    }

    current += char
  }

  if (current.trim()) parts.push(current.trim())
  return parts
}

function getRouteFlagActivation(normalizedCondition, guardExpression, extras = [], guardShape = null) {
  const normalized = stripWrappingParens(normalizedCondition).replace(/\s+/g, '')
  if (!normalized) return null

  let activation = null
  if (normalized === 'ROUTE_CONFIG.enableExperimental') {
    activation = {
      mode: 'flag',
      flag: 'ENABLE_EXPERIMENTAL_ROUTES',
      default: false,
    }
  } else if (normalized === 'ROUTE_CONFIG.enableInternal') {
    activation = {
      mode: 'flag',
      flag: 'ENABLE_INTERNAL_ROUTES',
      default: false,
    }
  } else if (normalized === 'ROUTE_CONFIG.enableVpsAgentWeb') {
    activation = {
      mode: 'flag',
      flag: 'ENABLE_VPS_AGENT_WEB_ROUTES',
      default: false,
      exposure: 'bridge',
    }
  }

  if (!activation) return null

  return {
    ...activation,
    source: 'control_flow_guard',
    guardExpression,
    ...(guardShape ? { guardShape } : {}),
    ...(extras.length > 0 ? { additionalConditions: extras } : {}),
  }
}

function buildMultiFlagActivation(flagActivations, guardExpression, guardShape, additionalConditions = []) {
  const uniqueFlags = []
  const seenFlags = new Set()
  let exposure

  for (const activation of flagActivations) {
    if (!activation?.flag || seenFlags.has(activation.flag)) continue
    seenFlags.add(activation.flag)
    uniqueFlags.push(activation.flag)
    if (!exposure && activation.exposure) {
      exposure = activation.exposure
    }
  }

  if (uniqueFlags.length < 2) return null

  return {
    mode: 'flag_set',
    flags: uniqueFlags,
    default: false,
    source: 'control_flow_guard',
    guardExpression,
    ...(guardShape ? { guardShape } : {}),
    ...(additionalConditions.length > 0 ? { additionalConditions } : {}),
    ...(exposure ? { exposure } : {}),
  }
}

function uniqueFlagActivations(flagActivations) {
  const seenFlags = new Set()
  return flagActivations.filter((activation) => {
    if (!activation?.flag || seenFlags.has(activation.flag)) return false
    seenFlags.add(activation.flag)
    return true
  })
}

function analyzeRouteActivationExpression(expression, guardExpression) {
  const normalized = stripWrappingParens(expression)
  if (!normalized) {
    return { activations: [], residuals: [] }
  }

  const directActivation = getRouteFlagActivation(normalized, guardExpression)
  if (directActivation) {
    return {
      activations: [directActivation],
      residuals: [],
    }
  }

  const andTerms = splitTopLevelLogical(normalized, '&&')
  if (andTerms.length > 1) {
    const combined = andTerms.map((term) => analyzeRouteActivationExpression(term, guardExpression))
    return {
      activations: uniqueFlagActivations(combined.flatMap((item) => item.activations)),
      residuals: combined.flatMap((item) => item.residuals),
    }
  }

  const orTerms = splitTopLevelLogical(normalized, '||')
  if (orTerms.length > 1) {
    const branchAnalyses = orTerms.map((term) => analyzeRouteActivationExpression(term, guardExpression))
    const branchFlagSets = branchAnalyses.map((item) => new Set(item.activations.map((activation) => activation.flag)))
    const sharedFlags = branchAnalyses[0]?.activations
      .map((activation) => activation.flag)
      .filter((flag) => branchFlagSets.every((set) => set.has(flag))) || []

    if (sharedFlags.length === 0) {
      return {
        activations: [],
        residuals: [normalized],
      }
    }

    return {
      activations: uniqueFlagActivations(
        branchAnalyses[0].activations.filter((activation) => sharedFlags.includes(activation.flag))
      ),
      residuals: [],
    }
  }

  return {
    activations: [],
    residuals: [normalized],
  }
}

function classifyActivationFromGuard(controlFlowGuard) {
  if (!controlFlowGuard) return null

  const effectiveCondition = stripWrappingParens(controlFlowGuard.effectiveCondition || '')
  const resolvedCondition = stripWrappingParens(controlFlowGuard.resolvedCondition || effectiveCondition)
  const guardExpression = controlFlowGuard.condition || controlFlowGuard.effectiveCondition || ''

  const directActivation = getRouteFlagActivation(effectiveCondition, guardExpression)
  if (directActivation) return directActivation

  if (controlFlowGuard.kind === 'block') {
    const analysis = analyzeRouteActivationExpression(effectiveCondition, guardExpression)
    const guardShape = splitTopLevelLogical(effectiveCondition, '&&').length > 1 ? 'compound_and' : null

    const multiFlagActivation = buildMultiFlagActivation(
      analysis.activations,
      guardExpression,
      guardShape,
      analysis.residuals,
    )
    if (multiFlagActivation) {
      return multiFlagActivation
    }

    if (analysis.activations.length === 1) {
      return {
        ...analysis.activations[0],
        ...(guardShape ? { guardShape } : {}),
        ...(analysis.residuals.length > 0 ? { additionalConditions: analysis.residuals } : {}),
      }
    }
    return null
  }

  if (controlFlowGuard.kind === 'early_return') {
    const analysis = analyzeRouteActivationExpression(effectiveCondition, guardExpression)
    const guardShape = splitTopLevelLogical(resolvedCondition, '||').length > 1 ? 'compound_or' : null

    const multiFlagActivation = buildMultiFlagActivation(
      analysis.activations,
      guardExpression,
      guardShape,
      analysis.residuals,
    )
    if (multiFlagActivation) {
      return multiFlagActivation
    }

    if (analysis.activations.length === 1) {
      return {
        ...analysis.activations[0],
        ...(guardShape ? { guardShape } : {}),
        ...(analysis.residuals.length > 0 ? { additionalConditions: analysis.residuals } : {}),
      }
    }
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

function extractRouteRegistrations(source) {
  const results = []
  const functionScopes = extractFunctionScopes(source)
  const guards = extractControlFlowGuards(source, functionScopes)
  const withPrefixRegex = new RegExp(
    `\\b([A-Za-z_$][\\w$]*)\\.register\\(\\s*([A-Za-z_$][\\w$]*)\\s*,\\s*\\{[\\s\\S]*?prefix\\s*:\\s*(${STATIC_STRING_OR_EXPR_TOKEN})[\\s\\S]*?\\}\\s*\\)`,
    'gm'
  )
  const withoutPrefixRegex = /\b([A-Za-z_$][\w$]*)\.register\(\s*([A-Za-z_$][\w$]*)\s*\)/gm
  const seen = new Set()

  let match
  while ((match = withPrefixRegex.exec(source)) !== null) {
    const prefixExpression = String(match[3] || '').trim()
    const key = `${match.index}:${match[2]}:${prefixExpression}`
    if (seen.has(key)) continue
    seen.add(key)
    const enclosingFunction = findEnclosingFunction(functionScopes, match.index)
    const guard = enclosingFunction ? findGuardForIndex(guards, enclosingFunction.name, match.index) : null
    results.push({
      target: String(match[2] || '').trim(),
      prefixExpression,
      line: indexToLine(source, match.index),
      functionName: enclosingFunction?.name || null,
      controlFlowGuard: guard ? {
        kind: guard.guardKind,
        branch: guard.branch,
        condition: guard.condition,
        resolvedCondition: guard.resolvedCondition,
        effectiveCondition: guard.effectiveCondition,
        line: guard.line,
      } : null,
    })
  }

  while ((match = withoutPrefixRegex.exec(source)) !== null) {
    const key = `${match.index}:${match[2]}:`
    if (seen.has(key)) continue
    seen.add(key)
    const enclosingFunction = findEnclosingFunction(functionScopes, match.index)
    const guard = enclosingFunction ? findGuardForIndex(guards, enclosingFunction.name, match.index) : null
    results.push({
      target: String(match[2] || '').trim(),
      prefixExpression: '',
      line: indexToLine(source, match.index),
      functionName: enclosingFunction?.name || null,
      controlFlowGuard: guard ? {
        kind: guard.guardKind,
        branch: guard.branch,
        condition: guard.condition,
        resolvedCondition: guard.resolvedCondition,
        effectiveCondition: guard.effectiveCondition,
        line: guard.line,
      } : null,
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
