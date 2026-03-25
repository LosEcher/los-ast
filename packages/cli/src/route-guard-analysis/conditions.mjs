import {
  splitTopLevelArguments,
  splitTopLevelLogical,
  stripWrappingParens,
} from './syntax.mjs'

function formatBooleanTermForJoin(term, joinOperator) {
  const normalized = stripWrappingParens(term)
  if (!normalized) return ''
  if (joinOperator === '&&' && splitTopLevelLogical(normalized, '||').length > 1) {
    return `(${normalized})`
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

export {
  invertBooleanExpression,
  joinGuardConditions,
  normalizeGuardExpression,
  resolveGuardCondition,
}
