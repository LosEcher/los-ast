/**
 * ScanReducer — merges chunk results into a single ScanResult.
 * Deduplicates by stable key and applies deterministic sort.
 */

import { deterministicSort, summarizeParseFailures, PARSE_FAILURE_SAMPLE_LIMIT } from '../runner/shared.mjs'

/**
 * @typedef {object} ChunkResult
 * @property {string} chunkId
 * @property {number} filesScanned
 * @property {import('../runner/records.mjs').FindingRecord[]} findings
 * @property {import('../runner/scan.mjs').ParseFailure[]} parseFailures
 * @property {{ parsedOk: number, parseFailed: number }} costStats
 */

/**
 * Build a stable dedup key for a finding.
 * Uses: ruleId | file | range(start.index-end.index) | fingerprint | findingSource
 *
 * @param {import('../runner/records.mjs').FindingRecord} finding
 * @returns {string}
 */
export function buildDedupKey(finding) {
  const rangeStart = finding.range?.start?.index ?? 0
  const rangeEnd = finding.range?.end?.index ?? 0
  const findingSource = finding.findingSource || 'ast'
  return [
    finding.ruleId || '',
    finding.file || '',
    `${rangeStart}-${rangeEnd}`,
    finding.fingerprint || '',
    findingSource,
  ].join('|')
}

/**
 * Merge chunk results into a single scan result.
 * Deduplicates findings, aggregates parse failures, applies deterministic sort.
 *
 * @param {object} params
 * @param {ChunkResult[]} params.chunkResults
 * @param {boolean} [params.deterministic]
 * @param {boolean} [params.includeStats]
 * @returns {Promise<object>} - ScanResult-compatible object
 */
export async function reduceChunks({ chunkResults, deterministic = false, includeStats = false }) {
  const dedupSeen = new Set()
  const allFindings = []
  const allParseFailures = []

  for (const chunkResult of chunkResults) {
    for (const finding of chunkResult.findings) {
      const key = buildDedupKey(finding)
      if (!dedupSeen.has(key)) {
        dedupSeen.add(key)
        allFindings.push(finding)
      }
    }
    if (chunkResult.parseFailures && chunkResult.parseFailures.length > 0) {
      allParseFailures.push(...chunkResult.parseFailures)
    }
  }

  if (deterministic) {
    allFindings.sort(deterministicSort)
  }

  const totalFilesScanned = chunkResults.reduce((sum, r) => sum + r.filesScanned, 0)

  /** @type {object} */
  const result = {
    filesScanned: totalFilesScanned,
    findings: allFindings,
  }

  if (includeStats) {
    result._reduceStats = {
      totalChunks: chunkResults.length,
      totalFindingsBeforeDedup: chunkResults.reduce((s, r) => s + r.findings.length, 0),
      totalFindingsAfterDedup: allFindings.length,
      dedupedFindings:
        chunkResults.reduce((s, r) => s + r.findings.length, 0) - allFindings.length,
    }

    const parseFailureSummary = summarizeParseFailures(allParseFailures)
    if (parseFailureSummary) {
      result.parseFailures = parseFailureSummary
    }
  } else {
    const parseFailureSummary = summarizeParseFailures(allParseFailures)
    if (parseFailureSummary) {
      result.parseFailures = parseFailureSummary
    }
  }

  return result
}
