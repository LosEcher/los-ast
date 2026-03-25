import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { loadRuleFiles } from '@los-ast/core'
import {
  discoverFiles,
  explainAtPosition,
  fix,
  scan,
} from '../packages/core/src/runner.mjs'

test('runner public api discovers files and scans deterministically', async () => {
  const rules = await loadRuleFiles(['rules/languages/javascript/no-console-log.yml'])
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'los-ast-runner-'))
  const file = path.join(tmpRoot, 'demo.js')
  await fs.writeFile(file, 'console.log("hi")\n', 'utf8')

  const files = await discoverFiles({ rootDir: tmpRoot, include: ['**/*.js'], ignore: [] })
  assert.deepEqual(files, [file])

  const result = await scan({
    project: 'custom',
    rootDir: tmpRoot,
    include: ['**/*.js'],
    ignore: [],
    rules,
    deterministic: true,
  })

  assert.equal(result.filesScanned, 1)
  assert.equal(result.findings.length, 1)
  assert.equal(result.findings[0].fingerprint.length, 32)
})

test('runner public api fixes files and explains matches at a position', async () => {
  const rules = await loadRuleFiles(['rules/languages/javascript/no-console-log.yml'])
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'los-ast-runner-'))
  const file = path.join(tmpRoot, 'demo.js')
  await fs.writeFile(file, 'console.log("hi")\n', 'utf8')

  const explainResult = await explainAtPosition({
    rootDir: tmpRoot,
    file,
    rules,
    line: 0,
    column: 2,
    deterministic: true,
  })
  assert.equal(explainResult.matches.length, 1)
  assert.equal(explainResult.matches[0].ruleId, 'lang.javascript.no-console-log')

  const fixResult = await fix({
    project: 'custom',
    rootDir: tmpRoot,
    include: ['**/*.js'],
    ignore: [],
    rules,
    apply: true,
    dryRun: false,
    deterministic: true,
  })

  assert.equal(fixResult.results.length, 1)
  assert.equal(fixResult.results[0].applied, true)
  assert.match(await fs.readFile(file, 'utf8'), /console\.info/)
})
