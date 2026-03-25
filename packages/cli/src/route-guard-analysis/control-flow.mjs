import {
  extractBooleanHelperFunctions,
  extractFunctionFlagAliases,
  findMatchingBrace,
  indexToLine,
  invertBooleanExpression,
  joinGuardConditions,
  resolveGuardCondition,
} from './shared.mjs'

export function extractControlFlowGuards(source, functionScopes) {
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
