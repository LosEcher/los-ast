import test from 'node:test'
import assert from 'node:assert/strict'

import {
  classifyActivationFromGuard,
  extractRouteRegistrations,
} from '../packages/cli/src/route-guard-analysis.mjs'

test('route guard analysis classifies single-flag and multi-flag activations conservatively', () => {
  assert.deepEqual(classifyActivationFromGuard({
    kind: 'block',
    condition: 'ROUTE_CONFIG.enableExperimental && isReady',
    resolvedCondition: 'ROUTE_CONFIG.enableExperimental && isReady',
    effectiveCondition: 'ROUTE_CONFIG.enableExperimental && isReady',
  }), {
    mode: 'flag',
    flag: 'ENABLE_EXPERIMENTAL_ROUTES',
    default: false,
    source: 'control_flow_guard',
    guardExpression: 'ROUTE_CONFIG.enableExperimental && isReady',
    guardShape: 'compound_and',
    additionalConditions: ['isReady'],
  })

  assert.deepEqual(classifyActivationFromGuard({
    kind: 'early_return',
    condition: '!ROUTE_CONFIG.enableExperimental || !ROUTE_CONFIG.enableInternal',
    resolvedCondition: '!ROUTE_CONFIG.enableExperimental || !ROUTE_CONFIG.enableInternal',
    effectiveCondition: 'ROUTE_CONFIG.enableExperimental && ROUTE_CONFIG.enableInternal',
  }), {
    mode: 'flag_set',
    flags: ['ENABLE_EXPERIMENTAL_ROUTES', 'ENABLE_INTERNAL_ROUTES'],
    default: false,
    source: 'control_flow_guard',
    guardExpression: '!ROUTE_CONFIG.enableExperimental || !ROUTE_CONFIG.enableInternal',
    guardShape: 'compound_or',
  })
})

test('route guard analysis extracts guarded registrations with stable control-flow metadata', () => {
  const source = `
function registerRoutes(app) {
  if (!ROUTE_CONFIG.enableExperimental) {
    return
  }

  app.register(experimentalRoutes, { prefix: '/experimental' })
  app.register(coreRoutes)
}
`.trim()

  assert.deepEqual(extractRouteRegistrations(source), [
    {
      target: 'experimentalRoutes',
      prefixExpression: "'/experimental'",
      line: 6,
      functionName: 'registerRoutes',
      controlFlowGuard: {
        kind: 'early_return',
        branch: 'after_if',
        condition: '!ROUTE_CONFIG.enableExperimental',
        resolvedCondition: '!ROUTE_CONFIG.enableExperimental',
        effectiveCondition: 'ROUTE_CONFIG.enableExperimental',
        line: 2,
      },
    },
    {
      target: 'coreRoutes',
      prefixExpression: '',
      line: 7,
      functionName: 'registerRoutes',
      controlFlowGuard: {
        kind: 'early_return',
        branch: 'after_if',
        condition: '!ROUTE_CONFIG.enableExperimental',
        resolvedCondition: '!ROUTE_CONFIG.enableExperimental',
        effectiveCondition: 'ROUTE_CONFIG.enableExperimental',
        line: 2,
      },
    },
  ])
})
