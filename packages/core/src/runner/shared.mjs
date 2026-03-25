import crypto from 'node:crypto'

// 默认使用 Unix epoch，确保机器输出默认可稳定消费
// 只有在显式指定非确定性模式时才使用当前时间（当前未使用场景）
export function toIsoNow(deterministic = true) {
  if (deterministic) {
    return '1970-01-01T00:00:00.000Z'
  }
  return new Date().toISOString()
}

export const DEFAULT_EXCERPT_LENGTH = 240
export const EXPLAIN_EXCERPT_LENGTH = 400
export const PARSE_FAILURE_SAMPLE_LIMIT = 20

export function clampExcerpt(text, max = DEFAULT_EXCERPT_LENGTH) {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

export function renderReplacement(template, node, joinBy = ', ') {
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

export function passesConstraints(node, constraints) {
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

export function fingerprintFor({ ruleId, file, range, proposedReplacement, deterministic = false }) {
  const base = [
    String(ruleId),
    String(file),
    `${range.start.index}-${range.end.index}`,
    proposedReplacement == null ? '' : String(proposedReplacement),
  ].join('\n')
  if (deterministic) {
    return crypto.createHash('sha256').update(base).digest('hex').slice(0, 32)
  }
  return crypto.createHash('sha256').update(base).digest('hex')
}

export function validateNoOverlap(edits) {
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

export function deterministicSort(a, b) {
  if (a.file !== b.file) return a.file.localeCompare(b.file)
  if (a.range.start.line !== b.range.start.line) return a.range.start.line - b.range.start.line
  return a.range.start.column - b.range.start.column
}

export function summarizeParseFailures(parseFailures) {
  if (!Array.isArray(parseFailures) || parseFailures.length === 0) {
    return null
  }

  const byLanguage = {}
  for (const failure of parseFailures) {
    byLanguage[failure.language] = (byLanguage[failure.language] || 0) + 1
  }

  return {
    count: parseFailures.length,
    sampleLimit: PARSE_FAILURE_SAMPLE_LIMIT,
    truncated: parseFailures.length > PARSE_FAILURE_SAMPLE_LIMIT,
    byLanguage,
    samples: parseFailures.slice(0, PARSE_FAILURE_SAMPLE_LIMIT),
  }
}
