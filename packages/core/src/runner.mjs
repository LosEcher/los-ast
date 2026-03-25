import fs from 'node:fs/promises'
import path from 'node:path'

import fg from 'fast-glob'
import { createTwoFilesPatch } from 'diff'

import { languageFromFilePath, registerLanguages } from './languages.mjs'
import { defaultParseCache } from './parse-cache.mjs'
import {
  clampExcerpt,
  DEFAULT_EXCERPT_LENGTH,
  deterministicSort,
  EXPLAIN_EXCERPT_LENGTH,
  fingerprintFor,
  PARSE_FAILURE_SAMPLE_LIMIT,
  passesConstraints,
  renderReplacement,
  summarizeParseFailures,
  toIsoNow,
  validateNoOverlap,
} from './runner/shared.mjs'

export {
  DEFAULT_EXCERPT_LENGTH,
  EXPLAIN_EXCERPT_LENGTH,
  PARSE_FAILURE_SAMPLE_LIMIT,
} from './runner/shared.mjs'

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
  deterministic = false,
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
  const parseFailures = []

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
    } catch (error) {
      parseFailures.push({
        file,
        language: String(language),
        error: error instanceof Error ? error.message : String(error),
      })
      continue
    }

    for (const rule of rules) {
      if (rule.language !== String(language)) continue
      const findingSource = rule.findingSource || 'ast'
      const governanceDomain = rule.governance?.domain || null
      const impactHint = rule.governance?.impact || null
      const nodes = root.findAll({ rule: rule.rule })
      for (const node of nodes) {
        if (!passesConstraints(node, rule.constraints)) continue
        const range = node.range()
        const excerpt = clampExcerpt(node.text())
        const hasFix = Boolean(rule.fix?.replace)
        const proposedReplacement = hasFix
          ? renderReplacement(rule.fix.replace, node, rule.fix.joinBy)
          : null

        const fingerprint = fingerprintFor({ ruleId: rule.id, file, range, proposedReplacement, deterministic })
        findings.push({
          tool: 'los-ast',
          version: 0,
          timestamp: toIsoNow(deterministic),
          project,
          ruleFile: rule.ruleFile || rule.__file || null,
          ruleId: rule.id,
          findingSource,
          governanceDomain,
          impactHint,
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

  // Sort findings deterministically if requested
  if (deterministic) {
    findings.sort(deterministicSort)
  }

  const res = { filesScanned: files.length, findings }
  if (includeStats) {
    res.parseCache = parseCache.snapshotStats()
    const parseFailureSummary = summarizeParseFailures(parseFailures)
    if (parseFailureSummary) {
      res.parseFailures = parseFailureSummary
    }
  }
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
  deterministic = false,
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
        const findingSource = rule.findingSource || 'ast'
        const governanceDomain = rule.governance?.domain || null
        const impactHint = rule.governance?.impact || null
        const fingerprint = fingerprintFor({ ruleId: rule.id, file, range, proposedReplacement, deterministic })
        results.push({
          tool: 'los-ast',
          version: 0,
          timestamp: toIsoNow(deterministic),
          project,
          ruleFile: rule.ruleFile || rule.__file || null,
          ruleId: rule.id,
          findingSource,
          governanceDomain,
          impactHint,
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

  // Sort results deterministically if requested
  if (deterministic) {
    results.sort(deterministicSort)
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
  deterministic = false,
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
      const fingerprint = fingerprintFor({ ruleId: rule.id, file, range: r, proposedReplacement: null, deterministic })
      matches.push({
        ruleFile: rule.ruleFile || rule.__file || null,
        ruleId: rule.id,
        severity: rule.severity,
        message: rule.message,
        range: r,
        excerpt: clampExcerpt(node.text(), EXPLAIN_EXCERPT_LENGTH),
        fingerprint,
      })
    }
  }

  // Sort matches deterministically if requested
  // explainAtPosition 按 ruleId 排序（因为是单文件），区别于 scan/fix 按 file 排序
  if (deterministic) {
    matches.sort((a, b) => {
      if (a.ruleId !== b.ruleId) return a.ruleId.localeCompare(b.ruleId)
      if (a.range.start.line !== b.range.start.line) return a.range.start.line - b.range.start.line
      return a.range.start.column - b.range.start.column
    })
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
