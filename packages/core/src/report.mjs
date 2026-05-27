/**
 * 深排序对象键 - 用于确定性 JSON 输出
 * 递归地对所有嵌套对象的键进行排序
 */
function deepSortKeys(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(deepSortKeys)
  }

  const sorted = {}
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = deepSortKeys(obj[key])
  }
  return sorted
}

export function toJsonLines(records, deterministic = false) {
  if (deterministic) {
    // Deep sort keys for deterministic output
    return records.map((r) => JSON.stringify(deepSortKeys(r))).join('\n') + (records.length ? '\n' : '')
  }
  return records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : '')
}

export function toMarkdownScan({ project, filesScanned, findings, parseFailures, scanTelemetry, _scanMode, _reduceStats }) {
  const lines = []
  lines.push(`# los-ast scan report`)
  lines.push('')
  lines.push(`- project: ${project}`)
  lines.push(`- filesScanned: ${filesScanned}`)
  lines.push(`- findings: ${findings.length}`)
  if (_scanMode) {
    lines.push(`- scanMode: ${_scanMode.mode} (${_scanMode.chunks} chunks x ${_scanMode.concurrency} workers)`)
  }
  if (_reduceStats) {
    lines.push(`- reduceStats: ${_reduceStats.totalFindingsAfterDedup} findings after dedup (${_reduceStats.totalFindingsBeforeDedup} before, ${_reduceStats.dedupedFindings} removed)`)
  }
  if (parseFailures) {
    lines.push(`- parseFailures: ${parseFailures.count}`)
    if (parseFailures.byLanguage && Object.keys(parseFailures.byLanguage).length > 0) {
      const byLanguage = Object.entries(parseFailures.byLanguage)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([language, count]) => `${language}:${count}`)
        .join(', ')
      lines.push(`- parseFailuresByLanguage: ${byLanguage}`)
    }
    lines.push(`- parseFailureSamples: ${parseFailures.samples.length}/${parseFailures.sampleLimit}`)
    if (parseFailures.truncated) {
      lines.push(`- parseFailureSamplesTruncated: true`)
    }
  }
  if (scanTelemetry) {
    lines.push(`- scanTelemetryMode: ${scanTelemetry.mode}`)
    lines.push(`- scanDurationMs: ${scanTelemetry.durationMs}`)
    lines.push(`- scanRules: explicit=${scanTelemetry.explicitRulePatterns}, loaded=${scanTelemetry.loadedRules}`)
    if (typeof scanTelemetry.estimatedFiles === 'number') {
      lines.push(`- scanEstimatedFiles: ${scanTelemetry.estimatedFiles}`)
    }
    const nativeInputs = Object.entries(scanTelemetry.nativeInputs || {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, count]) => `${name}:${count}`)
      .join(', ')
    if (nativeInputs) {
      lines.push(`- scanNativeInputs: ${nativeInputs}`)
    }
  }
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
