const ROUTE_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'all']
const STATIC_STRING_TOKEN = "(?:\"([^\"\\r\\n]*)\"|'([^'\\r\\n]*)'|`([^`$\\r\\n]*)`)"
const STATIC_STRING_OR_EXPR_TOKEN = "(`(?:[^`\\\\]|\\\\.|\\$\\{[^}]+\\})*`|\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'|[A-Za-z_$][\\w$.]*)"
import {
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
} from './route-guard-analysis/shared.mjs'

function readStaticStringMatch(match, startIndex = 1) {
  for (let offset = 0; offset < 3; offset += 1) {
    const value = match[startIndex + offset]
    if (value !== undefined) {
      return value
    }
  }
  return ''
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
          [...inheritedConditions, invertBooleanExpression(resolvedCondition)],
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
        branchAnalyses[0].activations.filter((activation) => sharedFlags.includes(activation.flag)),
      ),
      residuals: [],
    }
  }

  return {
    activations: [],
    residuals: [normalized],
  }
}

function toSerializableControlFlowGuard(guard) {
  if (!guard) return null

  return {
    kind: guard.guardKind,
    branch: guard.branch,
    condition: guard.condition,
    resolvedCondition: guard.resolvedCondition,
    effectiveCondition: guard.effectiveCondition,
    line: guard.line,
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

function extractRouteRegistrations(source) {
  const results = []
  const functionScopes = extractFunctionScopes(source)
  const guards = extractControlFlowGuards(source, functionScopes)
  const withPrefixRegex = new RegExp(
    `\\b([A-Za-z_$][\\w$]*)\\.register\\(\\s*([A-Za-z_$][\\w$]*)\\s*,\\s*\\{[\\s\\S]*?prefix\\s*:\\s*(${STATIC_STRING_OR_EXPR_TOKEN})[\\s\\S]*?\\}\\s*\\)`,
    'gm',
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
      controlFlowGuard: toSerializableControlFlowGuard(guard),
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
      controlFlowGuard: toSerializableControlFlowGuard(guard),
    })
  }

  return results
}

export {
  classifyActivationFromGuard,
  extractRouteRegistrations,
}
