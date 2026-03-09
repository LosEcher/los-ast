import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

test('hub-lite artifact export writes scan, symbols, and structure-map outputs', () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'los-ast-artifacts-'))
  const repoRoot = process.cwd()

  execFileSync(
    process.execPath,
    [
      './packages/cli/src/export-artifacts.mjs',
      '--root',
      './fixtures/golden/lsclaw-sample',
      '--project',
      'lsclaw',
      '--include',
      'src/**/*.ts',
      '--output-dir',
      outputDir,
      '--deterministic',
    ],
    {
      cwd: repoRoot,
      stdio: 'pipe',
    }
  )

  const scanFindings = readFileSync(join(outputDir, 'scan-findings.jsonl'), 'utf-8').trim()
  const symbols = JSON.parse(readFileSync(join(outputDir, 'symbols.json'), 'utf-8'))
  const structureMap = JSON.parse(readFileSync(join(outputDir, 'structure-map.json'), 'utf-8'))

  assert.ok(scanFindings.length > 0)
  assert.ok(Array.isArray(symbols))
  assert.equal(structureMap.schema, 'lsclaw.los-ast.structure-map.v1')
  assert.equal(structureMap.version, '1.0.0')
  assert.ok(Array.isArray(structureMap.files))
  assert.ok(Array.isArray(structureMap.symbols))
  assert.ok(Array.isArray(structureMap.imports))
  assert.ok(Array.isArray(structureMap.declares))
  assert.ok(Array.isArray(structureMap.route_binds))
  assert.ok(structureMap.files.length > 0)
  assert.ok(structureMap.symbols.length > 0)
})
