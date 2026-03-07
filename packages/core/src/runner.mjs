import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

import fg from 'fast-glob'
import { createTwoFilesPatch } from 'diff'

import { languageFromFilePath, registerLanguages } from './languages.mjs'
import { defaultParseCache } from './parse-cache.mjs'

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

function passesConstraints(node, constraints) {
  if (!constraints || constraints.length === 0) return true
  for (const c of constraints) {
    const re = new RegExp(c.regex, c.flags || '')
    const mode = c.mode || 'any'
    if (c.name === '.') {
      if (!re.test(node.text())) return false
      continue
    }

    const single = node.getMatch(c.name)
    if (single) {
      if (!re.test(single.text())) return false
      continue
    }

    const many = node.getMultipleMatches(c.name) || []
    if (many.length === 0) return false
    const texts = many.map((n) => n.text())
    if (mode === 'all') {
      if (!texts.every((t) => re.test(t))) return false
    } else {
      if (!texts.some((t) => re.test(t))) return false
    }
  }
  return true
}

function fingerprintFor({ ruleId, file, range, proposedReplacement }) {
  const base = [
    String(ruleId),
    String(file),
    `${range.start.index}-${range.end.index}`,
    proposedReplacement == null ? '' : String(proposedReplacement),
  ].join('\n')
  return crypto.createHash('sha256').update(base).digest('hex')
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
  parseCache = defaultParseCache,
  includeStats = false,
  signal,
}) {
  registerLanguages()

  // 检查取消信号
  if (signal?.aborted) {
    const error = new Error('Scan cancelled by client')
    error.name = 'AbortError'
    error.code = 'ABORTED'
    throw error
  }

  const files = await discoverFiles({ rootDir, include, ignore })
  const findings = []

  for (const file of files) {
    // 检查取消信号
    if (signal?.aborted) {
      const error = new Error('Scan cancelled by client')
      error.name = 'AbortError'
      error.code = 'ABORTED'
      throw error
    }
    const language = languageFromFilePath(file)
    if (!language) continue

    let root
    try {
      const parsed = await parseCache.parseFile(file, language, { cacheAst: true })
      root = parsed.root
    } catch {
      continue
    }

    for (const rule of rules) {
      if (rule.language !== String(language)) continue
      const nodes = root.findAll({ rule: rule.rule })
      for (const node of nodes) {
        if (!passesConstraints(node, rule.constraints)) continue
        const range = node.range()
        const excerpt = clampExcerpt(node.text())
        const hasFix = Boolean(rule.fix?.replace)
        const proposedReplacement = hasFix
          ? renderReplacement(rule.fix.replace, node, rule.fix.joinBy)
          : null

        const fingerprint = fingerprintFor({ ruleId: rule.id, file, range, proposedReplacement })
        findings.push({
          tool: 'los-ast',
          version: 0,
          timestamp: toIsoNow(),
          project,
          ruleFile: rule.ruleFile || rule.__file || null,
          ruleId: rule.id,
          severity: rule.severity,
          message: rule.message,
          file,
          language: String(language),
          range,
          excerpt,
          hasFix,
          proposedReplacement,
          fingerprint,
        })
      }
    }
  }

  const res = { filesScanned: files.length, findings }
  if (includeStats) res.parseCache = parseCache.snapshotStats()
  return res
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
  parseCache = defaultParseCache,
  includeStats = false,
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

    let parsed
    try {
      parsed = await parseCache.parseFile(file, language, { cacheAst: false })
    } catch {
      continue
    }
    const { source, root } = parsed

    const edits = []
    const editMeta = []

    for (const rule of langRules) {
      if (changesApplied >= maxChanges) break
      const nodes = root.findAll({ rule: rule.rule })
      for (const node of nodes) {
        if (changesApplied >= maxChanges) break
        if (!passesConstraints(node, rule.constraints)) continue
        const range = node.range()
        const excerpt = clampExcerpt(node.text())
        const replacement = renderReplacement(rule.fix.replace, node, rule.fix.joinBy)
        if (replacement === node.text()) continue
        const edit = node.replace(replacement)
        edits.push(edit)
        editMeta.push({ rule, range, excerpt, proposedReplacement: replacement })
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
    if (apply) parseCache.invalidateFile(file)

    for (let i = 0; i < editMeta.length; i++) {
      const { rule, range, excerpt, proposedReplacement } = editMeta[i]
      const fingerprint = fingerprintFor({ ruleId: rule.id, file, range, proposedReplacement })
      results.push({
        tool: 'los-ast',
        version: 0,
        timestamp: toIsoNow(),
        project,
        ruleFile: rule.ruleFile || rule.__file || null,
        ruleId: rule.id,
        severity: rule.severity,
        message: rule.message,
        file,
        language: langKey,
        range,
        excerpt,
        hasFix: true,
        proposedReplacement,
        diff,
        applied: apply,
        fingerprint,
      })
    }
  }

  const res = { filesScanned: files.length, changesApplied: results.length, results }
  if (includeStats) res.parseCache = parseCache.snapshotStats()
  return res
}

export async function explainAtPosition({
  rootDir,
  file,
  rules,
  line,
  column,
  parseCache = defaultParseCache,
  includeStats = false,
}) {
  registerLanguages()

  const language = languageFromFilePath(file)
  if (!language) return { file, language: null, matches: [] }
  const parsed = await parseCache.parseFile(file, language, { cacheAst: true })
  const root = parsed.root

  const matches = []
  for (const rule of rules) {
    if (rule.language !== String(language)) continue
    const nodes = root.findAll({ rule: rule.rule })
    for (const node of nodes) {
      if (!passesConstraints(node, rule.constraints)) continue
      const r = node.range()
      const inLine =
        (line > r.start.line || (line === r.start.line && column >= r.start.column)) &&
        (line < r.end.line || (line === r.end.line && column <= r.end.column))
      if (!inLine) continue
      const fingerprint = fingerprintFor({ ruleId: rule.id, file, range: r, proposedReplacement: null })
      matches.push({
        ruleFile: rule.ruleFile || rule.__file || null,
        ruleId: rule.id,
        severity: rule.severity,
        message: rule.message,
        range: r,
        excerpt: clampExcerpt(node.text(), 400),
        fingerprint,
      })
    }
  }

  const res = {
    rootDir,
    file,
    language: String(language),
    position: { line, column },
    matches,
  }
  if (includeStats) res.parseCache = parseCache.snapshotStats()
  return res
}
