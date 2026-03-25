import {
  EXPLAIN_EXCERPT_LENGTH,
  clampExcerpt,
  fingerprintFor,
  renderReplacement,
  toIsoNow,
} from './shared.mjs'

export function buildFindingRecord({
  project,
  rule,
  file,
  language,
  range,
  excerpt,
  proposedReplacement,
  deterministic,
  diff,
  applied,
}) {
  const findingSource = rule.findingSource || 'ast'
  const governanceDomain = rule.governance?.domain || null
  const impactHint = rule.governance?.impact || null
  const fingerprint = fingerprintFor({ ruleId: rule.id, file, range, proposedReplacement, deterministic })

  return {
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
    language,
    range,
    excerpt,
    hasFix: proposedReplacement !== null,
    proposedReplacement,
    ...(diff !== undefined ? { diff } : {}),
    ...(applied !== undefined ? { applied } : {}),
    fingerprint,
  }
}

export function buildScanFinding({ project, rule, file, language, node, deterministic }) {
  const hasFix = Boolean(rule.fix?.replace)
  const proposedReplacement = hasFix
    ? renderReplacement(rule.fix.replace, node, rule.fix.joinBy)
    : null

  return buildFindingRecord({
    project,
    rule,
    file,
    language,
    range: node.range(),
    excerpt: clampExcerpt(node.text()),
    proposedReplacement,
    deterministic,
  })
}

export function buildExplainMatch({ rule, file, range, excerptText, deterministic }) {
  return {
    ruleFile: rule.ruleFile || rule.__file || null,
    ruleId: rule.id,
    severity: rule.severity,
    message: rule.message,
    range,
    excerpt: clampExcerpt(excerptText, EXPLAIN_EXCERPT_LENGTH),
    fingerprint: fingerprintFor({ ruleId: rule.id, file, range, proposedReplacement: null, deterministic }),
  }
}
