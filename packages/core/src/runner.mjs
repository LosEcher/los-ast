import fs from 'node:fs/promises'
import path from 'node:path'

import fg from 'fast-glob'
import { parse } from '@ast-grep/napi'
import { createTwoFilesPatch } from 'diff'

import { languageFromFilePath, registerLanguages } from './languages.mjs'

function toIsoNow() {
  return new Date().toISOString()
}

function clampExcerpt(text, max = 240) {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

function renderReplacement(template, node, joinBy = ', ') {
  return template.replace(/\$\$\$([A-Za-z_][A-Za-z0-9_]*)|\$([A-Za-z_][A-Za-z0-9_]*)/g, (m, many, single) => {
    if (many) {
      const nodes = node.getMultipleMatches(many) || []
      return nodes.map((n) => n.text()).join(joinBy)
    }
    if (single) {
      const n = node.getMatch(single)
      return n ? n.text() : m
    }
    return m
  })
}

function validateNoOverlap(edits) {
  const sorted = [...edits].sort((a, b) => a.startPos - b.startPos)
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const cur = sorted[i]
    if (cur.startPos < prev.endPos) {
      throw new Error(`overlapping edits at ${prev.startPos}-${prev.endPos} and ${cur.startPos}-${cur.endPos}`)
    }
  }
  return sorted
}

export async function discoverFiles({ rootDir, include, ignore }) {
  const patterns = include && include.length ? include : ['**/*']
  const files = await fg(patterns, {
    cwd: rootDir,
    onlyFiles: true,
    absolute: true,
    unique: true,
    dot: false,
    ignore: ignore || [],
  })
  return files
}

export async function scan({
  project = 'custom',
  rootDir,
  include,
  ignore,
  rules,
}) {
  registerLanguages()

  const files = await discoverFiles({ rootDir, include, ignore })
  const findings = []

  for (const file of files) {
    const language = languageFromFilePath(file)
    if (!language) continue

    let source
    try {
      source = await fs.readFile(file, 'utf8')
    } catch {
      continue
    }

    let root
    try {
      root = parse(language, source).root()
    } catch {
      continue
    }

    for (const rule of rules) {
      if (rule.language !== String(language)) continue
      const nodes = root.findAll({ rule: rule.rule })
      for (const node of nodes) {
        const range = node.range()
        const excerpt = clampExcerpt(node.text())
        const hasFix = Boolean(rule.fix?.replace)
        const proposedReplacement = hasFix
          ? renderReplacement(rule.fix.replace, node, rule.fix.joinBy)
          : null

        findings.push({
          tool: 'los-ast',
          version: 0,
          timestamp: toIsoNow(),
          project,
          ruleId: rule.id,
          severity: rule.severity,
          message: rule.message,
          file,
          language: String(language),
          range,
          excerpt,
          hasFix,
          proposedReplacement,
        })
      }
    }
  }

  return { filesScanned: files.length, findings }
}

export async function fix({
  project = 'custom',
  rootDir,
  include,
  ignore,
  rules,
  dryRun = true,
  apply = false,
  maxChanges = 20,
}) {
  if (apply && dryRun) throw new Error('invalid options: --apply cannot be combined with --dry-run')
  if (!apply && !dryRun) dryRun = true

  registerLanguages()

  const files = await discoverFiles({ rootDir, include, ignore })
  const perFileRules = new Map()
  for (const rule of rules) {
    if (rule.fix?.replace) {
      const k = rule.language
      if (!perFileRules.has(k)) perFileRules.set(k, [])
      perFileRules.get(k).push(rule)
    }
  }

  const results = []
  let changesApplied = 0

  for (const file of files) {
    if (changesApplied >= maxChanges) break
    const language = languageFromFilePath(file)
    if (!language) continue
    const langKey = String(language)
    const langRules = perFileRules.get(langKey)
    if (!langRules || langRules.length === 0) continue

    let source
    try {
      source = await fs.readFile(file, 'utf8')
    } catch {
      continue
    }

    let root
    try {
      root = parse(language, source).root()
    } catch {
      continue
    }

    const edits = []
    const editMeta = []

    for (const rule of langRules) {
      if (changesApplied >= maxChanges) break
      const nodes = root.findAll({ rule: rule.rule })
      for (const node of nodes) {
        if (changesApplied >= maxChanges) break
        const replacement = renderReplacement(rule.fix.replace, node, rule.fix.joinBy)
        if (replacement === node.text()) continue
        const edit = node.replace(replacement)
        edits.push(edit)
        editMeta.push({ rule, node })
        changesApplied += 1
      }
    }

    if (edits.length === 0) continue

    const sortedEdits = validateNoOverlap(edits)
    const newSource = root.commitEdits(sortedEdits)
    const diff = createTwoFilesPatch(
      path.relative(rootDir, file),
      path.relative(rootDir, file),
      source,
      newSource,
      'before',
      'after',
      { context: 3 },
    )

    if (apply) await fs.writeFile(file, newSource, 'utf8')

    for (let i = 0; i < editMeta.length; i++) {
      const { rule, node } = editMeta[i]
      results.push({
        tool: 'los-ast',
        version: 0,
        timestamp: toIsoNow(),
        project,
        ruleId: rule.id,
        severity: rule.severity,
        message: rule.message,
        file,
        language: langKey,
        range: node.range(),
        excerpt: clampExcerpt(node.text()),
        hasFix: true,
        proposedReplacement: renderReplacement(rule.fix.replace, node, rule.fix.joinBy),
        diff,
        applied: apply,
      })
    }
  }

  return { filesScanned: files.length, changesApplied: results.length, results }
}

export async function explainAtPosition({
  rootDir,
  file,
  rules,
  line,
  column,
}) {
  registerLanguages()

  const language = languageFromFilePath(file)
  if (!language) return { file, language: null, matches: [] }
  const source = await fs.readFile(file, 'utf8')
  const root = parse(language, source).root()

  const matches = []
  for (const rule of rules) {
    if (rule.language !== String(language)) continue
    const nodes = root.findAll({ rule: rule.rule })
    for (const node of nodes) {
      const r = node.range()
      const inLine =
        (line > r.start.line || (line === r.start.line && column >= r.start.column)) &&
        (line < r.end.line || (line === r.end.line && column <= r.end.column))
      if (!inLine) continue
      matches.push({
        ruleId: rule.id,
        severity: rule.severity,
        message: rule.message,
        range: r,
        excerpt: clampExcerpt(node.text(), 400),
      })
    }
  }

  return {
    rootDir,
    file,
    language: String(language),
    position: { line, column },
    matches,
  }
}

