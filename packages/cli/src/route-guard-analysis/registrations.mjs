import {
  extractFunctionScopes,
  indexToLine,
} from './shared.mjs'
import { extractControlFlowGuards } from './control-flow.mjs'

const STATIC_STRING_OR_EXPR_TOKEN = "(`(?:[^`\\\\]|\\\\.|\\$\\{[^}]+\\})*`|\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'|[A-Za-z_$][\\w$.]*)"

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

export function extractRouteRegistrations(source) {
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
