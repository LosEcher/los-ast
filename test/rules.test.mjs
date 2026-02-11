import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { fix, loadRuleFiles, scan } from '@los-ast/core'

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

