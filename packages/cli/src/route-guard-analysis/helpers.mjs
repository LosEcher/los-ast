import {
  invertBooleanExpression,
  resolveGuardCondition,
} from './conditions.mjs'
import {
  findMatchingBrace,
  indexToLine,
  parseParameterNames,
  splitTopLevelStatements,
  stripComments,
} from './syntax.mjs'

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

export {
  extractBooleanHelperFunctions,
  extractFunctionFlagAliases,
  extractFunctionScopes,
}
