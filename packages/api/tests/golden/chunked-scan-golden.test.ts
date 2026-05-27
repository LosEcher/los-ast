/**
 * Golden validation tests — verify single vs chunked mode produce identical output.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { scan, initializeCore, loadRuleFiles } from '@los-ast/core'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let globalRules: any[] = []

beforeAll(async () => {
  await initializeCore()
  const rulesDir = path.resolve(__dirname, '../../../../rules')
  if (fs.existsSync(rulesDir)) {
    globalRules = await loadRuleFiles(rulesDir)
  }
})

/**
 * Build a stable key for sorting/diffing findings independent of scan mode.
 */
function findingKey(f: any): string {
  const rs = f.range?.start?.index ?? 0
  const re = f.range?.end?.index ?? 0
  return [
    f.ruleId || '',
    f.file || '',
    `${rs}-${re}`,
    f.fingerprint || '',
    f.findingSource || 'ast',
  ].join('|')
}

function sortedKeys(findings: any[]): string[] {
  return findings.map(findingKey).sort()
}

describe('Sequential vs Chunked output equivalence', () => {
  it('mini-js fixture: single vs parallel produce same findings', async () => {
    const rootDir = path.resolve(__dirname, '../../../../fixtures/golden/mini-js')

    const [singleRes, chunkedRes] = await Promise.all([
      scan({ project: 'mini-js', rootDir, rules: globalRules, mode: 'single', deterministic: true }),
      scan({ project: 'mini-js', rootDir, rules: globalRules, mode: 'parallel', deterministic: true }),
    ])

    expect(singleRes.filesScanned).toBe(chunkedRes.filesScanned)
    expect(singleRes.findings.length).toBe(chunkedRes.findings.length)

    const singleKeys = sortedKeys(singleRes.findings)
    const chunkedKeys = sortedKeys(chunkedRes.findings)
    expect(singleKeys).toEqual(chunkedKeys)
  })

  it('cantool-sample fixture: single vs parallel produce same findings', async () => {
    const rootDir = path.resolve(__dirname, '../../../../fixtures/golden/cantool-sample')

    const [singleRes, chunkedRes] = await Promise.all([
      scan({ project: 'cantool', rootDir, rules: globalRules, mode: 'single', deterministic: true }),
      scan({ project: 'cantool', rootDir, rules: globalRules, mode: 'parallel', deterministic: true }),
    ])

    expect(singleRes.filesScanned).toBe(chunkedRes.filesScanned)
    expect(singleRes.findings.length).toBe(chunkedRes.findings.length)

    const singleKeys = sortedKeys(singleRes.findings)
    const chunkedKeys = sortedKeys(chunkedRes.findings)
    expect(singleKeys).toEqual(chunkedKeys)
  })
})

describe('Synthetic large project chunked scan', () => {
  const tmpDir = path.join(os.tmpdir(), `los-ast-golden-${Date.now()}`)

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true })
    // Create 150 synthetic JS files — enough to trigger chunked path (>100 files)
    for (let i = 0; i < 150; i++) {
      const filePath = path.join(tmpDir, `file-${String(i).padStart(3, '0')}.js`)
      // Every 10th file has a console.log call that could match a rule
      const hasConsoleLog = i % 10 === 0
      const content = hasConsoleLog
        ? `// Synthetic file ${i}\nconst x = "${'a'.repeat(i % 50)}";\nconsole.log(x);\n`
        : `// Synthetic file ${i}\nconst x = "${'a'.repeat(i % 50)}";\n`
      fs.writeFileSync(filePath, content, 'utf-8')
    }
  })

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('single vs chunked produce identical findings on 150 files', async () => {
    const [singleRes, chunkedRes] = await Promise.all([
      scan({ project: 'synthetic', rootDir: tmpDir, rules: globalRules, mode: 'single', deterministic: true }),
      scan({ project: 'synthetic', rootDir: tmpDir, rules: globalRules, mode: 'chunked', deterministic: true }),
    ])

    expect(singleRes.filesScanned).toBe(chunkedRes.filesScanned)
    expect(singleRes.findings.length).toBe(chunkedRes.findings.length)

    const singleKeys = sortedKeys(singleRes.findings)
    const chunkedKeys = sortedKeys(chunkedRes.findings)
    expect(singleKeys).toEqual(chunkedKeys)
  }, 30000)

  it('chunked path produces valid _scanMode telemetry', async () => {
    const res = await scan({
      project: 'synthetic',
      rootDir: tmpDir,
      rules: globalRules,
      mode: 'chunked',
      includeStats: true,
    })

    expect(res._scanMode).toBeDefined()
    expect(res._scanMode!.chunks).toBeGreaterThanOrEqual(1)
    expect(res._scanMode!.concurrency).toBeGreaterThanOrEqual(1)
  }, 30000)
})
