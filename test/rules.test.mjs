import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createParseCache, fix, loadRuleFiles, scan, toMarkdownScan } from '@los-ast/core'

test('javascript no-console-log fix is correct and idempotent', async () => {
  const rules = await loadRuleFiles(['rules/languages/javascript/no-console-log.yml'])

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'los-ast-'))
  const before = await fs.readFile('fixtures/lang.javascript.no-console-log/before.js', 'utf8')
  const after = await fs.readFile('fixtures/lang.javascript.no-console-log/after.js', 'utf8')

  const file = path.join(tmpRoot, 'demo.js')
  await fs.writeFile(file, before, 'utf8')

  const scanRes = await scan({
    project: 'custom',
    rootDir: tmpRoot,
    include: ['**/*.js'],
    ignore: [],
    rules,
  })
  assert.equal(scanRes.findings.length, 1)

  const fixRes1 = await fix({
    project: 'custom',
    rootDir: tmpRoot,
    include: ['**/*.js'],
    ignore: [],
    rules,
    apply: true,
    dryRun: false,
    maxChanges: 20,
  })
  assert.equal(fixRes1.results.length, 1)
  assert.equal(await fs.readFile(file, 'utf8'), after)

  const fixRes2 = await fix({
    project: 'custom',
    rootDir: tmpRoot,
    include: ['**/*.js'],
    ignore: [],
    rules,
    apply: true,
    dryRun: false,
    maxChanges: 20,
  })
  assert.equal(fixRes2.results.length, 0)
  assert.equal(await fs.readFile(file, 'utf8'), after)
})

test('constraints filter, ruleFile/fingerprint exist, parse cache hits', async () => {
  const rulePath = 'rules/languages/javascript/console-method-constraint.yml'
  const rules = await loadRuleFiles([rulePath])

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'los-ast-'))
  const before = await fs.readFile('fixtures/lang.javascript.console-method-constraint/before.js', 'utf8')
  const after = await fs.readFile('fixtures/lang.javascript.console-method-constraint/after.js', 'utf8')

  const file = path.join(tmpRoot, 'demo.js')
  await fs.writeFile(file, before, 'utf8')

  const parseCache = createParseCache({ maxEntries: 8 })

  const scanRes1 = await scan({
    project: 'custom',
    rootDir: tmpRoot,
    include: ['**/*.js'],
    ignore: [],
    rules,
    parseCache,
    includeStats: true,
  })
  assert.equal(scanRes1.findings.length, 1)
  assert.ok(scanRes1.findings[0].ruleFile)
  assert.equal(scanRes1.findings[0].ruleId, 'lang.javascript.console-method-constraint')
  assert.equal(typeof scanRes1.findings[0].fingerprint, 'string')
  assert.equal(scanRes1.findings[0].fingerprint.length, 64)

  const scanRes2 = await scan({
    project: 'custom',
    rootDir: tmpRoot,
    include: ['**/*.js'],
    ignore: [],
    rules,
    parseCache,
    includeStats: true,
  })
  assert.equal(scanRes2.findings.length, 1)
  assert.equal(scanRes2.findings[0].fingerprint, scanRes1.findings[0].fingerprint)
  assert.ok(scanRes2.parseCache.hits >= 1)

  const fixRes1 = await fix({
    project: 'custom',
    rootDir: tmpRoot,
    include: ['**/*.js'],
    ignore: [],
    rules,
    apply: true,
    dryRun: false,
    maxChanges: 20,
    parseCache,
  })
  assert.equal(fixRes1.results.length, 1)
  assert.equal(await fs.readFile(file, 'utf8'), after)
  assert.ok(fixRes1.results[0].ruleFile)
  assert.equal(typeof fixRes1.results[0].fingerprint, 'string')
  assert.equal(fixRes1.results[0].fingerprint.length, 64)

  const fixRes2 = await fix({
    project: 'custom',
    rootDir: tmpRoot,
    include: ['**/*.js'],
    ignore: [],
    rules,
    apply: true,
    dryRun: false,
    maxChanges: 20,
    parseCache,
  })
  assert.equal(fixRes2.results.length, 0)
  assert.equal(await fs.readFile(file, 'utf8'), after)
})

test('scan includeStats reports parse failures without changing findings semantics', async () => {
  const rules = await loadRuleFiles(['rules/languages/javascript/no-console-log.yml'])

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'los-ast-'))
  await fs.writeFile(path.join(tmpRoot, 'valid.js'), "console.log('ok')\n", 'utf8')
  await fs.writeFile(path.join(tmpRoot, 'broken.js'), "console.log('broken')\n", 'utf8')
  const baseParseCache = createParseCache({ maxEntries: 8 })
  const parseCache = {
    async parseFile(filePath, language, options) {
      if (filePath.endsWith('broken.js')) {
        throw new Error('Synthetic parse failure')
      }
      return baseParseCache.parseFile(filePath, language, options)
    },
    invalidateFile(filePath) {
      baseParseCache.invalidateFile(filePath)
    },
    snapshotStats() {
      return baseParseCache.snapshotStats()
    },
  }

  const scanRes = await scan({
    project: 'custom',
    rootDir: tmpRoot,
    include: ['**/*.js'],
    ignore: [],
    rules,
    includeStats: true,
    parseCache,
  })

  assert.equal(scanRes.filesScanned, 2)
  assert.equal(scanRes.findings.length, 1)
  assert.equal(scanRes.parseFailures.count, 1)
  assert.equal(scanRes.parseFailures.sampleLimit, 20)
  assert.deepEqual(scanRes.parseFailures.byLanguage, { JavaScript: 1 })
  assert.match(scanRes.parseFailures.samples[0].file, /broken\.js$/)
  assert.equal(scanRes.parseFailures.samples[0].language, 'JavaScript')
  assert.equal(typeof scanRes.parseFailures.samples[0].error, 'string')
})

test('markdown scan report includes parse failure aggregates', async () => {
  const markdown = toMarkdownScan({
    project: 'custom',
    filesScanned: 2,
    findings: [],
    parseFailures: {
      count: 3,
      sampleLimit: 20,
      byLanguage: {
        JavaScript: 2,
        TypeScript: 1,
      },
      samples: [
        { file: '/tmp/a.js', language: 'JavaScript', error: 'Unexpected token' },
        { file: '/tmp/b.js', language: 'JavaScript', error: 'Unexpected token' },
      ],
    },
  })

  assert.match(markdown, /parseFailures: 3/)
  assert.match(markdown, /parseFailuresByLanguage: JavaScript:2, TypeScript:1/)
  assert.match(markdown, /parseFailureSamples: 2\/20/)
})

test('scan parse failure stats cap samples while preserving totals', async () => {
  const rules = await loadRuleFiles(['rules/languages/javascript/no-console-log.yml'])
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'los-ast-'))
  await fs.writeFile(path.join(tmpRoot, 'valid.js'), "console.log('ok')\n", 'utf8')

  for (let index = 0; index < 25; index += 1) {
    await fs.writeFile(path.join(tmpRoot, `broken-${index}.js`), `console.log(${index})\n`, 'utf8')
  }

  const baseParseCache = createParseCache({ maxEntries: 32 })
  const parseCache = {
    async parseFile(filePath, language, options) {
      if (path.basename(filePath).startsWith('broken-')) {
        throw new Error('Synthetic parse failure')
      }
      return baseParseCache.parseFile(filePath, language, options)
    },
    invalidateFile(filePath) {
      baseParseCache.invalidateFile(filePath)
    },
    snapshotStats() {
      return baseParseCache.snapshotStats()
    },
  }

  const scanRes = await scan({
    project: 'custom',
    rootDir: tmpRoot,
    include: ['**/*.js'],
    ignore: [],
    rules,
    includeStats: true,
    parseCache,
  })

  assert.equal(scanRes.filesScanned, 26)
  assert.equal(scanRes.findings.length, 1)
  assert.equal(scanRes.parseFailures.count, 25)
  assert.equal(scanRes.parseFailures.sampleLimit, 20)
  assert.equal(scanRes.parseFailures.samples.length, 20)
  assert.deepEqual(scanRes.parseFailures.byLanguage, { JavaScript: 25 })
})

test('governance metadata is projected into scan findings', async () => {
  const rules = await loadRuleFiles(['rules/projects/lsclaw-governance/frontend-interface.yml'])

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'los-ast-'))
  const file = path.join(tmpRoot, 'demo.ts')
  await fs.writeFile(
    file,
    "async function load() { const resp = await fetch('/api/v1/items', { method: 'GET' }) }\n",
    'utf8'
  )

  const scanRes = await scan({
    project: 'custom',
    rootDir: tmpRoot,
    include: ['**/*.ts'],
    ignore: [],
    rules,
  })

  assert.equal(scanRes.findings.length, 1)
  assert.equal(scanRes.findings[0].ruleId, 'lsclaw-governance.frontend-http-client')
  assert.equal(scanRes.findings[0].findingSource, 'ast')
  assert.deepEqual(scanRes.findings[0].governanceDomain, ['frontend'])
  assert.equal(scanRes.findings[0].impactHint, 'medium')
})

test('frontend governance rule matches axios methods and ignores non-http helpers', async () => {
  const rules = await loadRuleFiles(['rules/projects/lsclaw-governance/frontend-interface.yml'])

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'los-ast-'))
  await fs.writeFile(
    path.join(tmpRoot, 'axios-positive.ts'),
    "async function load() { return axios.get('/api/v1/items') }\n",
    'utf8'
  )
  await fs.writeFile(
    path.join(tmpRoot, 'axios-negative.ts'),
    "async function makeClient() { return axios.create({ baseURL: '/api' }) }\n",
    'utf8'
  )

  const scanRes = await scan({
    project: 'custom',
    rootDir: tmpRoot,
    include: ['**/*.ts'],
    ignore: [],
    rules,
  })

  assert.equal(scanRes.findings.length, 1)
  assert.equal(scanRes.findings[0].ruleId, 'lsclaw-governance.frontend-http-client-axios')
  assert.match(scanRes.findings[0].excerpt, /axios\.get/)
})

test('frontend governance rules cover common fetch and axios call shapes', async () => {
  const rules = await loadRuleFiles(['rules/projects/lsclaw-governance/frontend-interface.yml'])

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'los-ast-'))
  await fs.writeFile(
    path.join(tmpRoot, 'fetch-basic.ts'),
    "async function load() { return fetch('/health') }\n",
    'utf8'
  )
  await fs.writeFile(
    path.join(tmpRoot, 'fetch-options.ts'),
    "async function load() { return fetch('/items', { method: 'POST', body: payload }) }\n",
    'utf8'
  )
  await fs.writeFile(
    path.join(tmpRoot, 'axios-get.ts'),
    "async function load() { return axios.get('/items') }\n",
    'utf8'
  )
  await fs.writeFile(
    path.join(tmpRoot, 'axios-delete.ts'),
    "async function load() { return axios.delete('/items/1', { headers }) }\n",
    'utf8'
  )

  const scanRes = await scan({
    project: 'custom',
    rootDir: tmpRoot,
    include: ['**/*.ts'],
    ignore: [],
    rules,
  })

  assert.equal(scanRes.findings.length, 4)
  assert.deepEqual(
    scanRes.findings.map((finding) => finding.ruleId).sort(),
    [
      'lsclaw-governance.frontend-http-client',
      'lsclaw-governance.frontend-http-client',
      'lsclaw-governance.frontend-http-client-axios',
      'lsclaw-governance.frontend-http-client-axios',
    ]
  )
})

test('frontend governance axios rule only matches configured HTTP methods', async () => {
  const rules = await loadRuleFiles(['rules/projects/lsclaw-governance/frontend-interface.yml'])

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'los-ast-'))
  await fs.writeFile(
    path.join(tmpRoot, 'axios-head.ts'),
    "async function load() { return axios.head('/health') }\n",
    'utf8'
  )
  await fs.writeFile(
    path.join(tmpRoot, 'axios-options.ts'),
    "async function load() { return axios.options('/health') }\n",
    'utf8'
  )

  const scanRes = await scan({
    project: 'custom',
    rootDir: tmpRoot,
    include: ['**/*.ts'],
    ignore: [],
    rules,
  })

  assert.equal(scanRes.findings.length, 0)
})

test('frontend governance rules cover window.fetch and common client aliases', async () => {
  const rules = await loadRuleFiles(['rules/projects/lsclaw-governance/frontend-interface.yml'])

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'los-ast-'))
  await fs.writeFile(
    path.join(tmpRoot, 'window-fetch.ts'),
    "async function load() { return window.fetch('/health') }\n",
    'utf8'
  )
  await fs.writeFile(
    path.join(tmpRoot, 'api-client.ts'),
    "const apiClient = axios.create({ baseURL: '/api' })\nasync function load() { return apiClient.post('/items', payload) }\n",
    'utf8'
  )
  await fs.writeFile(
    path.join(tmpRoot, 'http-alias.ts'),
    "const http = axios\nasync function load() { return http.get('/items') }\n",
    'utf8'
  )
  await fs.writeFile(
    path.join(tmpRoot, 'request-client.ts'),
    "const requestClient = axios.create({ baseURL: '/api' })\nasync function load() { return requestClient.patch('/items/1', payload) }\n",
    'utf8'
  )
  await fs.writeFile(
    path.join(tmpRoot, 'rest-client.ts'),
    "const restClient = axios.create({ baseURL: '/api' })\nasync function load() { return restClient.delete('/items/1') }\n",
    'utf8'
  )
  await fs.writeFile(
    path.join(tmpRoot, 'billing-api.ts'),
    "const billingApi = createApiClient()\nasync function load() { return billingApi.get('/billing/invoices') }\n",
    'utf8'
  )
  await fs.writeFile(
    path.join(tmpRoot, 'request-gateway.ts'),
    "const requestGateway = createGateway()\nasync function load() { return requestGateway.post('/jobs', payload) }\n",
    'utf8'
  )
  await fs.writeFile(
    path.join(tmpRoot, 'metrics-client.ts'),
    "const metricsClient = createMetricsClient()\nasync function load() { return metricsClient.getGauge('latency') }\n",
    'utf8'
  )
  await fs.writeFile(
    path.join(tmpRoot, 'cache-store.ts'),
    "const cacheStore = createCacheStore()\nasync function load() { return cacheStore.get('feature-flag') }\n",
    'utf8'
  )

  const scanRes = await scan({
    project: 'custom',
    rootDir: tmpRoot,
    include: ['**/*.ts'],
    ignore: [],
    rules,
  })

  assert.equal(scanRes.findings.length, 7)
  assert.deepEqual(
    scanRes.findings.map((finding) => finding.ruleId).sort(),
    [
      'lsclaw-governance.frontend-http-client',
      'lsclaw-governance.frontend-http-client-axios',
      'lsclaw-governance.frontend-http-client-axios',
      'lsclaw-governance.frontend-http-client-axios',
      'lsclaw-governance.frontend-http-client-axios',
      'lsclaw-governance.frontend-http-client-axios',
      'lsclaw-governance.frontend-http-client-axios',
    ]
  )
  assert.ok(scanRes.findings.some((finding) => /window\.fetch/.test(finding.excerpt)))
  assert.ok(scanRes.findings.some((finding) => /apiClient\.post/.test(finding.excerpt)))
  assert.ok(scanRes.findings.some((finding) => /http\.get/.test(finding.excerpt)))
  assert.ok(scanRes.findings.some((finding) => /requestClient\.patch/.test(finding.excerpt)))
  assert.ok(scanRes.findings.some((finding) => /restClient\.delete/.test(finding.excerpt)))
  assert.ok(scanRes.findings.some((finding) => /billingApi\.get/.test(finding.excerpt)))
  assert.ok(scanRes.findings.some((finding) => /requestGateway\.post/.test(finding.excerpt)))
  assert.ok(!scanRes.findings.some((finding) => /cacheStore\.get/.test(finding.excerpt)))
})

test('lsclaw-governance rule pack has stable fixture baseline', async () => {
  const rules = await loadRuleFiles(['rules/projects/lsclaw-governance/**/*.yml'])
  const fixtureRoot = path.resolve('fixtures/golden/lsclaw-governance-pack')
  const expectedOutput = JSON.parse(
    await fs.readFile(path.join(fixtureRoot, 'expected-output.json'), 'utf8')
  )

  const scanRes = await scan({
    project: 'lsclaw-governance-pack',
    rootDir: fixtureRoot,
    include: ['src/**/*.ts'],
    ignore: [],
    rules,
  })

  assert.equal(scanRes.filesScanned, expectedOutput.filesScanned)
  assert.equal(scanRes.findings.length, 5)

  const ruleCounts = Object.groupBy(scanRes.findings, (finding) => finding.ruleId)
  assert.equal(ruleCounts['lsclaw-governance.frontend-http-client']?.length, 1)
  assert.equal(ruleCounts['lsclaw-governance.frontend-http-client-axios']?.length, 1)
  assert.equal(ruleCounts['lsclaw-governance.backend-route-handler']?.length, 1)
  assert.equal(ruleCounts['lsclaw-governance.database-concat-query']?.length, 1)
  assert.equal(ruleCounts['lsclaw-governance.api-response-field-exposure']?.length, 1)

  const severityCounts = Object.groupBy(scanRes.findings, (finding) => finding.severity)
  assert.equal(severityCounts.error?.length, 1)
  assert.equal(severityCounts.warning?.length, 3)
  assert.equal(severityCounts.info?.length, 1)

  const impactCounts = Object.groupBy(scanRes.findings, (finding) => finding.impactHint)
  assert.equal(impactCounts.high?.length, 1)
  assert.equal(impactCounts.medium?.length, 3)
  assert.equal(impactCounts.low?.length, 1)
})
