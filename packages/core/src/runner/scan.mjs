import { languageFromFilePath, registerLanguages } from '../languages.mjs'
import { defaultParseCache } from '../parse-cache.mjs'
import { discoverFiles } from './discover.mjs'
import { buildScanFinding } from './records.mjs'
import {
  deterministicSort,
  passesConstraints,
  summarizeParseFailures,
} from './shared.mjs'

function throwIfAborted(signal) {
  if (!signal?.aborted) return
  const error = new Error('Scan cancelled by client')
  error.name = 'AbortError'
  error.code = 'ABORTED'
  throw error
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
  throwIfAborted(signal)

  const files = await discoverFiles({ rootDir, include, ignore })
  const findings = []
  const parseFailures = []

  for (const file of files) {
    throwIfAborted(signal)

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
      const nodes = root.findAll({ rule: rule.rule })
      for (const node of nodes) {
        if (!passesConstraints(node, rule.constraints)) continue
        findings.push(buildScanFinding({
          project,
          rule,
          file,
          language: String(language),
          node,
          deterministic,
        }))
      }
    }
  }

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
