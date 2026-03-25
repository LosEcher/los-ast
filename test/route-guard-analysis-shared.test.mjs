import assert from 'node:assert/strict'
import test from 'node:test'
import {
  extractBooleanHelperFunctions,
  extractFunctionFlagAliases,
  extractFunctionScopes,
  invertBooleanExpression,
  resolveGuardCondition,
  splitTopLevelLogical,
} from '../packages/cli/src/route-guard-analysis/shared.mjs'

test('route guard shared helpers resolve helper chains and aliases conservatively', () => {
  const source = `
    const isEnabled = (flag) => flag
    const shouldExposePreview = (flag) => isEnabled(flag) && ROUTE_CONFIG.enableInternal

    export async function registerPreview(server) {
      const previewEnabled = ROUTE_CONFIG.enableExperimental
      const internalEnabled = ROUTE_CONFIG.enableInternal
      if (previewEnabled && shouldExposePreview(previewEnabled) && internalEnabled) {
        return server
      }
      return null
    }
  `

  const scopes = extractFunctionScopes(source)
  const helpers = extractBooleanHelperFunctions(source, scopes)
  const aliasesByFunction = extractFunctionFlagAliases(source, scopes)
  const aliases = aliasesByFunction.get('registerPreview')

  assert.equal(
    helpers.get('shouldExposePreview').expression,
    'flag && ROUTE_CONFIG.enableInternal'
  )
  assert.equal(
    resolveGuardCondition('previewEnabled && shouldExposePreview(previewEnabled)', aliases, helpers),
    'ROUTE_CONFIG.enableExperimental && (ROUTE_CONFIG.enableExperimental && ROUTE_CONFIG.enableInternal)'
  )
})

test('route guard shared helpers invert grouped expressions without losing operator precedence', () => {
  const inverted = invertBooleanExpression('(ROUTE_CONFIG.enableExperimental && ROUTE_CONFIG.enableInternal) || ROUTE_CONFIG.enableVpsAgentWeb')

  assert.equal(
    inverted,
    '(!ROUTE_CONFIG.enableExperimental || !ROUTE_CONFIG.enableInternal) && !ROUTE_CONFIG.enableVpsAgentWeb'
  )
  assert.deepEqual(
    splitTopLevelLogical('ROUTE_CONFIG.enableExperimental && (ROUTE_CONFIG.enableInternal || ROUTE_CONFIG.enableVpsAgentWeb)', '&&'),
    ['ROUTE_CONFIG.enableExperimental', '(ROUTE_CONFIG.enableInternal || ROUTE_CONFIG.enableVpsAgentWeb)']
  )
})
