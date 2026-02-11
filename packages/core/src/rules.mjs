import fs from 'node:fs/promises'
import path from 'node:path'

import fg from 'fast-glob'
import { parse as parseYaml } from 'yaml'

function normalizeSeverity(severity) {
  const s = String(severity || 'warning').toLowerCase()
  if (s === 'info' || s === 'warning' || s === 'error') return s
  return 'warning'
}

function assertRuleShape(rule) {
  if (!rule || typeof rule !== 'object') throw new Error('rule must be an object')
  if (!rule.id || typeof rule.id !== 'string') throw new Error('rule.id must be a string')
  if (!rule.language || typeof rule.language !== 'string') throw new Error('rule.language must be a string')
  if (!rule.message || typeof rule.message !== 'string') throw new Error('rule.message must be a string')
  if (!rule.rule || typeof rule.rule !== 'object') throw new Error('rule.rule must be an object')
  if (rule.fix != null) {
    if (typeof rule.fix !== 'object') throw new Error('rule.fix must be an object')
    if (typeof rule.fix.replace !== 'string') throw new Error('rule.fix.replace must be a string')
    if (rule.fix.joinBy != null && typeof rule.fix.joinBy !== 'string') throw new Error('rule.fix.joinBy must be a string')
  }
}

export async function loadRuleFiles(rulePaths) {
  const files = await fg(rulePaths, {
    onlyFiles: true,
    unique: true,
    absolute: true,
  })

  const rules = []
  for (const file of files) {
    const raw = await fs.readFile(file, 'utf8')
    const doc = parseYaml(raw)
    if (Array.isArray(doc)) {
      for (const item of doc) rules.push({ __file: file, ...item })
    } else {
      rules.push({ __file: file, ...doc })
    }
  }

  const normalized = rules.map((r) => {
    const rule = { ...r }
    rule.severity = normalizeSeverity(rule.severity)
    return rule
  })

  for (const rule of normalized) {
    try {
      assertRuleShape(rule)
    } catch (e) {
      const rel = path.relative(process.cwd(), rule.__file || '')
      throw new Error(`[rules] invalid rule in ${rel}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const seen = new Set()
  for (const rule of normalized) {
    if (seen.has(rule.id)) throw new Error(`[rules] duplicated id: ${rule.id}`)
    seen.add(rule.id)
  }

  return normalized
}

