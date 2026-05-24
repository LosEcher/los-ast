import assert from 'node:assert/strict'
import test from 'node:test'

import {
  attachRouteRuntimeDeltas,
  buildExportArtifactsSummary,
  buildRouteRuntimeDeltas,
  buildStructureMapArtifact,
  normalizeComparableRoutePath,
  parseExportArtifactsArgs,
} from '../packages/cli/src/export-artifacts/shared.mjs'

test('export artifacts shared helpers parse argv deterministically', () => {
  const args = parseExportArtifactsArgs([
    '--root',
    './fixtures/project',
    '--project',
    'lsclaw',
    '--include',
    'src/**/*.ts',
    '--include',
    'src/**/*.tsx',
    '--ignore',
    'dist/**',
    '--rules',
    'rules/**/*.yml',
    '--output-dir',
    './logs/out',
    '--deterministic',
  ])

  assert.deepEqual(args, {
    root: './fixtures/project',
    project: 'lsclaw',
    include: ['src/**/*.ts', 'src/**/*.tsx'],
    ignore: ['dist/**'],
    rules: ['rules/**/*.yml'],
    outputDir: './logs/out',
    deterministic: true,
    experimentalExtractors: false,
  })
})

test('export artifacts shared helpers normalize comparable paths and runtime deltas conservatively', () => {
  assert.equal(normalizeComparableRoutePath('/api/users/'), '/api/users')
  assert.equal(normalizeComparableRoutePath('/'), '/')

  const routeBinds = [
    { method: 'GET', path: '/api/users', file: 'src/routes/users.ts' },
    { method: 'POST', path: '/api/users', file: 'src/routes/users.ts' },
  ]
  const routeRuntime = [
    { method: 'GET', path: '/api/users/' },
    { method: 'HEAD', path: '/api/users/' },
    { method: 'DELETE', path: '/api/users' },
  ]

  const deltas = buildRouteRuntimeDeltas(routeBinds, routeRuntime, true)
  assert.deepEqual(deltas, [
    {
      method: 'DELETE',
      path: '/api/users',
      relation: 'runtime_only',
      reasons: [],
      matchedBind: null,
    },
    {
      method: 'GET',
      path: '/api/users/',
      relation: 'runtime_variant',
      reasons: ['trailing_slash_variant'],
      matchedBind: {
        method: 'GET',
        path: '/api/users',
        file: 'src/routes/users.ts',
      },
    },
    {
      method: 'HEAD',
      path: '/api/users/',
      relation: 'runtime_variant',
      reasons: ['auto_head', 'trailing_slash_variant'],
      matchedBind: {
        method: 'GET',
        path: '/api/users',
        file: 'src/routes/users.ts',
      },
    },
  ])

  const withDeltas = attachRouteRuntimeDeltas(routeRuntime, deltas)
  assert.equal(withDeltas[0].delta?.relation, 'runtime_variant')
  assert.equal(withDeltas[1].delta?.reasons[0], 'auto_head')
  assert.equal(withDeltas[2].delta?.relation, 'runtime_only')
})

test('export artifacts shared helpers build stable structure-map artifacts and summaries', () => {
  const structureMap = buildStructureMapArtifact({
    project: 'lsclaw',
    rootDir: '/tmp/fixture',
    deterministic: true,
    structureFiles: [{ path: 'src/index.ts', role: 'route' }],
    structureSymbols: [{ name: 'buildServer', kind: 'function' }],
    structureImports: [{ source: './routes.js' }],
    structureDeclares: [{ kind: 'function', name: 'buildServer' }],
    routeDeclares: [{ method: 'GET', path: '/users' }],
    routeMounts: [{ target: 'apiRoutes', resolvedPrefix: '/api' }],
    routeBinds: [{ method: 'GET', path: '/api/users' }],
    routeRuntimeWithDeltas: [{ method: 'GET', path: '/api/users', delta: null }],
    routeRuntimeDeltas: [{ method: 'GET', path: '/api/users', relation: 'exact_match', reasons: [], matchedBind: { method: 'GET', path: '/api/users', file: 'src/routes.ts' } }],
  })

  assert.equal(structureMap.schema, 'lsclaw.los-ast.structure-map.v1')
  assert.equal(structureMap.generatedAt, '1970-01-01T00:00:00.000Z')
  assert.equal(structureMap.source.scanArtifactPath, 'scan-findings.jsonl')
  assert.equal(structureMap.route_runtime.length, 1)

  const summaryWithBinds = buildExportArtifactsSummary({
    project: 'lsclaw',
    rootDir: '/tmp/fixture',
    outputDir: '/tmp/out',
    scanResult: { findings: [{ ruleId: 'rule-1' }, { ruleId: 'rule-2' }] },
    structureFiles: structureMap.files,
    structureSymbols: structureMap.symbols,
    structureImports: structureMap.imports,
    structureDeclares: structureMap.declares,
    routeDeclares: structureMap.route_declares,
    routeMounts: structureMap.route_mounts,
    routeBinds: structureMap.route_binds,
    routeRuntimeWithDeltas: structureMap.route_runtime,
    routeRuntimeDeltas: structureMap.route_runtime_deltas,
  })

  assert.equal(summaryWithBinds.counts.findings, 2)
  assert.equal(summaryWithBinds.artifactPaths.structureMap, '/tmp/out/structure-map.json')
  assert.equal(summaryWithBinds.limitations.length, 1)

  const summaryWithoutBinds = buildExportArtifactsSummary({
    project: 'lsclaw',
    rootDir: '/tmp/fixture',
    outputDir: '/tmp/out',
    scanResult: { findings: [] },
    structureFiles: [],
    structureSymbols: [],
    structureImports: [],
    structureDeclares: [],
    routeDeclares: [],
    routeMounts: [],
    routeBinds: [],
    routeRuntimeWithDeltas: [],
    routeRuntimeDeltas: [],
  })

  assert.equal(summaryWithoutBinds.limitations.length, 2)
  assert.match(summaryWithoutBinds.limitations[1], /route_binds may remain empty/)
})
