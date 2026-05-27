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

test('route guard analysis extracts registrations guarded by else-if chains with inherited conditions', () => {
  const source = `
function registerRoutes(app) {
  if (!ROUTE_CONFIG.enableExperimental) {
    return
  } else if (!ROUTE_CONFIG.enableInternal) {
    app.register(internalApi, { prefix: '/internal' })
  } else {
    app.register(coreApi, { prefix: '/core' })
  }
}
`.trim()

  const result = extractRouteRegistrations(source)

  // The internalApi is inside the else-if block.
  // The guard's branch is 'if' (else-if is syntax sugar, treated as a new if
  // with inherited conditions from the parent if's negation)
  const internalEntry = result.find((r) => r.target === 'internalApi')
  assert.ok(internalEntry, 'should find internalApi registration')
  assert.equal(internalEntry.functionName, 'registerRoutes')
  assert.ok(internalEntry.controlFlowGuard, 'should have control flow guard')
  // The effectiveCondition should require both the first condition's negation
  // (enableExperimental) AND the else-if's own condition
  assert.ok(
    internalEntry.controlFlowGuard.effectiveCondition.includes('ROUTE_CONFIG.enableExperimental'),
    'effectiveCondition should include negation of first guard',
  )
  assert.ok(
    internalEntry.controlFlowGuard.effectiveCondition.includes('!ROUTE_CONFIG.enableInternal'),
    'effectiveCondition should include else-if condition',
  )

  // The coreApi is inside the else block (both conditions failed)
  const coreEntry = result.find((r) => r.target === 'coreApi')
  assert.ok(coreEntry, 'should find coreApi registration')
  assert.equal(coreEntry.functionName, 'registerRoutes')
  assert.ok(coreEntry.controlFlowGuard, 'should have control flow guard')
  assert.equal(coreEntry.controlFlowGuard.branch, 'else')
})

test('route guard analysis handles compound AND block guard for flag alias', () => {
  const source = `
function registerRoutes(app) {
  const experimentalEnabled = ROUTE_CONFIG.enableExperimental
  if (experimentalEnabled && ROUTE_CONFIG.enableInternal) {
    app.register(adminRoutes, { prefix: '/admin' })
  }
}
`.trim()

  const result = extractRouteRegistrations(source)

  // adminRoutes is guarded by a compound AND block guard
  const adminEntry = result.find((r) => r.target === 'adminRoutes')
  assert.ok(adminEntry, 'should find adminRoutes registration')
  assert.ok(adminEntry.controlFlowGuard, 'should have control flow guard')
  assert.equal(adminEntry.controlFlowGuard.kind, 'block')
  // The effective condition should resolve the alias and combine with &&
  assert.ok(
    adminEntry.controlFlowGuard.effectiveCondition.includes('ROUTE_CONFIG.enableExperimental'),
    'should include resolved alias condition',
  )
  assert.ok(
    adminEntry.controlFlowGuard.effectiveCondition.includes('ROUTE_CONFIG.enableInternal'),
    'should include direct flag reference',
  )
})
