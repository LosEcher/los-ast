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

function indexToLine(source, index) {
  if (!Number.isFinite(index) || index <= 0) return 1
  return source.slice(0, index).split(/\r?\n/).length
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
    const negatedParsedCall = negatedCallMatch ? parseSimpleCallExpression(negatedCallMatch[1]) : null
    const negatedHelper = negatedParsedCall ? helperMap.get(negatedParsedCall.callee) : null
    if (negatedHelper && negatedHelper.params.length === negatedParsedCall.args.length) {
      const substituted = replaceParameterReferences(negatedHelper.expression, negatedHelper.params, negatedParsedCall.args)
      if (substituted) {
        resolved = invertBooleanExpression(substituted)
        if (resolved !== previous) continue
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

export {
  extractBooleanHelperFunctions,
  extractFunctionFlagAliases,
  extractFunctionScopes,
  findMatchingBrace,
  indexToLine,
  invertBooleanExpression,
  joinGuardConditions,
  normalizeGuardExpression,
  resolveGuardCondition,
  splitTopLevelLogical,
  stripWrappingParens,
}
