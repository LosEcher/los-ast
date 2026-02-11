export function toJsonLines(records) {
  return records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : '')
}

export function toMarkdownScan({ project, filesScanned, findings }) {
  const lines = []
  lines.push(`# los-ast scan report`)
  lines.push('')
  lines.push(`- project: ${project}`)
  lines.push(`- filesScanned: ${filesScanned}`)
  lines.push(`- findings: ${findings.length}`)
  lines.push('')
  for (const f of findings) {
    lines.push(`## ${f.ruleId}`)
    lines.push('')
    lines.push(`- severity: ${f.severity}`)
    lines.push(`- file: ${f.file}`)
    lines.push(`- range: ${f.range.start.line}:${f.range.start.column} - ${f.range.end.line}:${f.range.end.column}`)
    lines.push('')
    lines.push('```')
    lines.push(f.excerpt || '')
    lines.push('```')
    lines.push('')
  }
  return lines.join('\n')
}

export function toMarkdownFix({ project, filesScanned, changesApplied, results }) {
  const lines = []
  lines.push(`# los-ast fix report`)
  lines.push('')
  lines.push(`- project: ${project}`)
  lines.push(`- filesScanned: ${filesScanned}`)
  lines.push(`- changes: ${changesApplied}`)
  lines.push('')
  const byFile = new Map()
  for (const r of results) {
    const arr = byFile.get(r.file) || []
    arr.push(r)
    byFile.set(r.file, arr)
  }
  for (const [file, items] of byFile) {
    lines.push(`## ${file}`)
    lines.push('')
    lines.push('```diff')
    lines.push(items[0].diff || '')
    lines.push('```')
    lines.push('')
  }
  return lines.join('\n')
}

