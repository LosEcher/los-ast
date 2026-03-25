import { languageFromFilePath, registerLanguages } from '../languages.mjs'
import { defaultParseCache } from '../parse-cache.mjs'
import { buildExplainMatch } from './records.mjs'
import { passesConstraints } from './shared.mjs'

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
      const range = node.range()
      const inLine =
        (line > range.start.line || (line === range.start.line && column >= range.start.column)) &&
        (line < range.end.line || (line === range.end.line && column <= range.end.column))
      if (!inLine) continue
      matches.push(buildExplainMatch({
        rule,
        file,
        range,
        excerptText: node.text(),
        deterministic,
      }))
    }
  }

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
