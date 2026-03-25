import test from 'node:test'
import assert from 'node:assert/strict'

import {
  classifyRouteActivation,
  classifyRouteTier,
  extractDetailedImports,
  normalizeRoutePath,
  resolveLocalModule,
  resolveStaticExpression,
} from '../packages/cli/src/source-structure-extractor/shared.mjs'

test('source structure shared helpers normalize route paths and classify route tiers', () => {
  assert.equal(normalizeRoutePath('/experimental/', '/foo'), '/experimental/foo')
  assert.equal(normalizeRoutePath('', 'healthz/live'), '/healthz/live')
  assert.equal(classifyRouteTier('/experimental/foo'), 'experimental')
  assert.deepEqual(classifyRouteActivation('/vps-agent-web/jobs'), {
    mode: 'flag',
    flag: 'ENABLE_VPS_AGENT_WEB_ROUTES',
    default: false,
    exposure: 'bridge',
  })
})

test('source structure shared helpers extract mixed import clauses with stable line numbers', () => {
  const source = [
    "import Foo, { bar as baz, type Quux } from './dep.js'",
    "import './side-effect.js'",
  ].join('\n')

  assert.deepEqual(extractDetailedImports(source), [
    {
      importedName: 'default',
      localName: 'Foo',
      importKind: 'default',
      specifier: './dep.js',
      line: 1,
    },
    {
      importedName: 'bar',
      localName: 'baz',
      importKind: 'named',
      specifier: './dep.js',
      line: 1,
    },
    {
      importedName: 'Quux',
      localName: 'Quux',
      importKind: 'named',
      specifier: './dep.js',
      line: 1,
    },
  ])
})

test('source structure shared helpers resolve local modules and imported prefix expressions conservatively', () => {
  const availableFiles = new Set([
    'src/routes/index.ts',
    'src/config/routes.ts',
  ])
  const moduleInfos = new Map([
    ['src/config/routes.ts', {
      routePrefixDefaults: {
        experimental: '/experimental',
      },
    }],
  ])
  const info = {
    file: { path: 'src/routes/index.ts' },
    constBindings: [
      { name: 'prefix', expression: 'routeConfig.prefixes.experimental' },
      { name: 'literalPrefix', expression: '`/api`' },
    ],
    imports: [
      {
        localName: 'routeConfig',
        specifier: '../config/routes',
      },
    ],
  }

  assert.equal(resolveLocalModule('src/routes/index.ts', '../config/routes', availableFiles), 'src/config/routes.ts')
  assert.equal(resolveStaticExpression('prefix', info, moduleInfos, availableFiles), '/experimental')
  assert.equal(resolveStaticExpression('literalPrefix', info, moduleInfos, availableFiles), '/api')
  assert.equal(resolveStaticExpression('unknownPrefix', info, moduleInfos, availableFiles), null)
})
