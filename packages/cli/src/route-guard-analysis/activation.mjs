import {
  splitTopLevelLogical,
  stripWrappingParens,
} from './shared.mjs'

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

export function classifyActivationFromGuard(controlFlowGuard) {
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
