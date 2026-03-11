import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
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

function writeFixtureFile(rootDir, relativePath, content) {
  const target = join(rootDir, relativePath)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content, 'utf-8')
}

test('hub-lite artifact export classifies page route contract and state files', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'los-ast-role-fixture-'))
  const outputDir = mkdtempSync(join(tmpdir(), 'los-ast-role-output-'))
  const repoRoot = process.cwd()

  writeFixtureFile(
    fixtureRoot,
    'src/admin/app/pages/ChatPage.tsx',
    `export function ChatPage() { return null }\n`
  )
  writeFixtureFile(
    fixtureRoot,
    'src/routes/chat.mjs',
    `export async function registerChat() {}\n`
  )
  writeFixtureFile(
    fixtureRoot,
    'src/shared/contracts/thread-types.ts',
    `export type Thread = { threadId: string }\n`
  )
  writeFixtureFile(
    fixtureRoot,
    'src/state/store.mjs',
    `export function getStore() { return null }\n`
  )

  execFileSync(
    process.execPath,
    [
      './packages/cli/src/export-artifacts.mjs',
      '--root',
      fixtureRoot,
      '--project',
      'custom',
      '--include',
      'src/**/*.ts',
      '--include',
      'src/**/*.tsx',
      '--include',
      'src/**/*.mjs',
      '--output-dir',
      outputDir,
      '--deterministic',
    ],
    {
      cwd: repoRoot,
      stdio: 'pipe',
    }
  )

  const structureMap = JSON.parse(readFileSync(join(outputDir, 'structure-map.json'), 'utf-8'))
  const fileRoles = Object.fromEntries(structureMap.files.map((item) => [item.path, item.role]))

  assert.equal(fileRoles['src/admin/app/pages/ChatPage.tsx'], 'page')
  assert.equal(fileRoles['src/routes/chat.mjs'], 'route')
  assert.equal(fileRoles['src/shared/contracts/thread-types.ts'], 'contract')
  assert.equal(fileRoles['src/state/store.mjs'], 'state')
})
