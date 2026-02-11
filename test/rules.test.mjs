import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createParseCache, fix, loadRuleFiles, scan } from '@los-ast/core'

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
