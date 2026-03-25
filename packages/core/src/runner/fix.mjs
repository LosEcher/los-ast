import fs from 'node:fs/promises'
import path from 'node:path'

import { createTwoFilesPatch } from 'diff'

import { languageFromFilePath, registerLanguages } from '../languages.mjs'
import { defaultParseCache } from '../parse-cache.mjs'
import { discoverFiles } from './discover.mjs'
import { buildFindingRecord } from './records.mjs'
import {
  clampExcerpt,
  deterministicSort,
  passesConstraints,
  renderReplacement,
  validateNoOverlap,
} from './shared.mjs'

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
        const replacement = renderReplacement(rule.fix.replace, node, rule.fix.joinBy)
        if (replacement === node.text()) continue
        edits.push(node.replace(replacement))
        editMeta.push({
          rule,
          range: node.range(),
          excerpt: clampExcerpt(node.text()),
          proposedReplacement: replacement,
        })
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

    for (const edit of editMeta) {
      results.push(buildFindingRecord({
        project,
        rule: edit.rule,
        file,
        language: langKey,
        range: edit.range,
        excerpt: edit.excerpt,
        proposedReplacement: edit.proposedReplacement,
        deterministic,
        diff,
        applied: apply,
      }))
    }
  }

  if (deterministic) {
    results.sort(deterministicSort)
  }

  const res = { filesScanned: files.length, changesApplied: results.length, results }
  if (includeStats) res.parseCache = parseCache.snapshotStats()
  return res
}
