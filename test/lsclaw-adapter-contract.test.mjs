import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

function runNodeScript(args) {
  return execFileSync(process.execPath, args, {
    cwd: process.cwd(),
    stdio: 'pipe',
    encoding: 'utf-8',
  })
}

test('lsclaw adapter contract: hub-lite artifacts keep stable output names and structure-map fields', () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'los-ast-lsclaw-adapter-'))

  runNodeScript([
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
  ])

  const scanFindings = readFileSync(join(outputDir, 'scan-findings.jsonl'), 'utf-8').trim()
  const symbols = JSON.parse(readFileSync(join(outputDir, 'symbols.json'), 'utf-8'))
  const structureMap = JSON.parse(readFileSync(join(outputDir, 'structure-map.json'), 'utf-8'))

  assert.ok(scanFindings.length > 0)
  assert.ok(Array.isArray(symbols))
  assert.equal(structureMap.schema, 'lsclaw.los-ast.structure-map.v1')
  assert.equal(structureMap.version, '1.0.0')

  for (const field of [
    'project',
    'rootDir',
    'generatedAt',
    'source',
    'files',
    'symbols',
    'imports',
    'declares',
    'route_declares',
    'route_mounts',
    'route_binds',
    'route_runtime',
    'route_runtime_deltas',
  ]) {
    assert.ok(Object.hasOwn(structureMap, field), `missing structure-map field: ${field}`)
  }

  assert.equal(structureMap.source.tool, 'los-ast')
  assert.equal(structureMap.source.mode, 'cli')
  assert.equal(structureMap.source.scanArtifactPath, 'scan-findings.jsonl')
  assert.equal(structureMap.source.symbolsArtifactPath, 'symbols.json')
  assert.ok(Array.isArray(structureMap.route_binds))
  assert.ok(Array.isArray(structureMap.route_runtime))
  assert.ok(Array.isArray(structureMap.route_runtime_deltas))
})
