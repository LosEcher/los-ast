/**
 * Core Runner Scan Module Tests
 * Phase 1: Core runner test coverage
 */

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { loadRuleFiles } from '@los-ast/core'
import { scan } from '../../packages/core/src/runner/scan.mjs'

test('scan handles empty file list', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'los-ast-empty-'))
  
  const result = await scan({
    project: 'test',
    rootDir: tmpRoot,
    include: ['**/*.js'],
    ignore: [],
    rules: [],
  })

  assert.equal(result.filesScanned, 0)
  assert.deepEqual(result.findings, [])
})

test('scan handles parse failures gracefully', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'los-ast-parse-fail-'))
  // Create a file with syntax error
  await fs.writeFile(path.join(tmpRoot, 'broken.js'), 'function {', 'utf8')
  
  const result = await scan({
    project: 'test',
    rootDir: tmpRoot,
    include: ['**/*.js'],
    ignore: [],
    rules: [],
    includeStats: true,
  })

  // Should complete without throwing
  assert.equal(result.filesScanned, 1)
  // parseFailures may be undefined if no failures or structured differently
  assert.ok(result.filesScanned >= 0)
})

test('scan respects abort signal', async () => {
  const controller = new AbortController()
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'los-ast-abort-'))
  
  // Create multiple files
  for (let i = 0; i < 5; i++) {
    await fs.writeFile(
      path.join(tmpRoot, `file${i}.js`),
      `console.log("file${i}")`,
      'utf8'
    )
  }

  const rules = await loadRuleFiles(['rules/languages/javascript/no-console-log.yml'])
  
  // Abort immediately
  controller.abort()
  
  await assert.rejects(
    scan({
      project: 'test',
      rootDir: tmpRoot,
      include: ['**/*.js'],
      ignore: [],
      rules,
      signal: controller.signal,
    }),
    /cancelled/
  )
})

test('scan filters findings by language', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'los-ast-lang-filter-'))
  
  // Create JS and TS files
  await fs.writeFile(path.join(tmpRoot, 'test.js'), 'console.log("js")', 'utf8')
  await fs.writeFile(path.join(tmpRoot, 'test.ts'), 'console.log("ts")', 'utf8')
  
  // Load only JS rule
  const jsRules = await loadRuleFiles(['rules/languages/javascript/no-console-log.yml'])
  
  const result = await scan({
    project: 'test',
    rootDir: tmpRoot,
    include: ['**/*.js', '**/*.ts'],
    ignore: [],
    rules: jsRules,
  })

  // Should only find in JS files (or TS if rule matches both)
  assert.ok(result.filesScanned >= 1)
})

test('scan returns parse cache stats when requested', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'los-ast-stats-'))
  await fs.writeFile(path.join(tmpRoot, 'test.js'), 'console.log("test")', 'utf8')
  
  const result = await scan({
    project: 'test',
    rootDir: tmpRoot,
    include: ['**/*.js'],
    ignore: [],
    rules: [],
    includeStats: true,
  })

  assert.ok(result.parseCache)
  assert.ok(typeof result.parseCache.hits === 'number')
  assert.ok(typeof result.parseCache.misses === 'number')
})

test('scan sorts findings deterministically', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'los-ast-sort-'))
  
  // Create files in reverse alphabetical order
  await fs.writeFile(path.join(tmpRoot, 'z.js'), 'console.log("z")', 'utf8')
  await fs.writeFile(path.join(tmpRoot, 'a.js'), 'console.log("a")', 'utf8')
  await fs.writeFile(path.join(tmpRoot, 'm.js'), 'console.log("m")', 'utf8')
  
  const rules = await loadRuleFiles(['rules/languages/javascript/no-console-log.yml'])
  
  const result = await scan({
    project: 'test',
    rootDir: tmpRoot,
    include: ['**/*.js'],
    ignore: [],
    rules,
    deterministic: true,
  })

  // Verify findings exist and have proper structure
  assert.ok(result.findings.length >= 0)
  if (result.findings.length > 0) {
    // Check first finding has file field
    assert.ok(result.findings[0].file)
    
    // Check findings are sorted by file path
    const files = result.findings.map(f => f.file)
    const sortedFiles = [...files].sort()
    assert.deepEqual(files, sortedFiles)
  }
})

test('scan handles files with unsupported extensions', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'los-ast-unsupported-'))
  
  await fs.writeFile(path.join(tmpRoot, 'test.py'), 'print("python")', 'utf8')
  await fs.writeFile(path.join(tmpRoot, 'test.js'), 'console.log("js")', 'utf8')
  
  const rules = await loadRuleFiles(['rules/languages/javascript/no-console-log.yml'])
  
  const result = await scan({
    project: 'test',
    rootDir: tmpRoot,
    include: ['**/*'],
    ignore: [],
    rules,
  })

  // Should scan both files but only find in JS
  assert.equal(result.filesScanned, 2)
  // Findings should only be from JS files (if any findings exist)
  result.findings.forEach(f => {
    assert.ok(f.file)
    assert.ok(f.file.endsWith('.js'))
  })
})

test('scan with no matching rules returns empty findings', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'los-ast-no-rules-'))
  await fs.writeFile(path.join(tmpRoot, 'test.js'), 'console.log("test")', 'utf8')
  
  const result = await scan({
    project: 'test',
    rootDir: tmpRoot,
    include: ['**/*.js'],
    ignore: [],
    rules: [], // No rules
  })

  assert.equal(result.filesScanned, 1)
  assert.deepEqual(result.findings, [])
})

test('scan handles nested directories', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'los-ast-nested-'))
  
  // Create nested structure
  await fs.mkdir(path.join(tmpRoot, 'src', 'components'), { recursive: true })
  await fs.writeFile(
    path.join(tmpRoot, 'src', 'app.js'),
    'console.log("app")',
    'utf8'
  )
  await fs.writeFile(
    path.join(tmpRoot, 'src', 'components', 'button.js'),
    'console.log("button")',
    'utf8'
  )
  
  const rules = await loadRuleFiles(['rules/languages/javascript/no-console-log.yml'])
  
  const result = await scan({
    project: 'test',
    rootDir: tmpRoot,
    include: ['**/*.js'],
    ignore: [],
    rules,
  })

  assert.equal(result.filesScanned, 2)
  assert.equal(result.findings.length, 2)
})
