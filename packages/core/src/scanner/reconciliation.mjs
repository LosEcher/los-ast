/**
 * Reconciliation — cross-file resolution phase between Map and Reduce.
 *
 * For chunked mode only: resolves imports that span chunk boundaries,
 * deduplicates cross-chunk call edges, and stitches structural summaries.
 *
 * When experimental extractors are not running (plain rule-based scan),
 * reconciliation is a no-op since rule scanning has no cross-file dependencies.
 */

/**
 * @typedef {object} ReconciledCallEdges
 * @property {object[]} callEdges
 * @property {object[]} importsV2
 * @property {object | null} structuralSummary
 */

/**
 * Reconcile extraction results across chunks.
 *
 * Currently handles:
 * 1. Call edge dedup: same `caller:callee:file:line` across chunks → keep first
 * 2. Import dedup: same `source_path:raw_specifier` → keep first resolved
 * 3. Structural summary merge: sum per-language counts
 *
 * @param {object} params
 * @param {object[]} params.allCallEdges
 * @param {object[]} params.allImportsV2
 * @param {object | null} params.structuralSummary
 * @param {boolean} [params.deterministic]
 * @returns {Promise<ReconciledCallEdges>}
 */
export async function reconcile({
  allCallEdges = [],
  allImportsV2 = [],
  structuralSummary = null,
  deterministic = false,
}) {
  // Dedup call edges
  const callEdgeSeen = new Set()
  const dedupedCallEdges = []
  for (const edge of allCallEdges) {
    const key = `${edge.caller || ''}:${edge.callee || ''}:${edge.file || ''}:${edge.line || 0}`
    if (!callEdgeSeen.has(key)) {
      callEdgeSeen.add(key)
      dedupedCallEdges.push(edge)
    }
  }

  // Dedup imports: prefer resolved, keep first
  const importSeen = new Set()
  const dedupedImports = []
  for (const imp of allImportsV2) {
    const key = `${imp.source_path || ''}:${imp.raw_specifier || ''}`
    if (importSeen.has(key)) {
      // If we already have this import resolved, skip
      const existing = dedupedImports.find(
        (d) => `${d.source_path || ''}:${d.raw_specifier || ''}` === key,
      )
      if (existing && !existing.resolved && imp.resolved) {
        // Replace unresolved with resolved
        existing.target_path = imp.target_path
        existing.resolved = true
      }
      continue
    }
    importSeen.add(key)
    dedupedImports.push({ ...imp })
  }

  // Merge structural summaries
  let mergedSummary = structuralSummary
  if (structuralSummary && structuralSummary._perChunk) {
    mergedSummary = mergeStructuralSummaries(structuralSummary._perChunk)
  }

  if (deterministic) {
    dedupedCallEdges.sort((a, b) =>
      `${a.file}:${a.line}`.localeCompare(`${b.file}:${b.line}`),
    )
    dedupedImports.sort((a, b) =>
      `${a.source_path}:${a.raw_specifier}`.localeCompare(
        `${b.source_path}:${b.raw_specifier}`,
      ),
    )
  }

  return {
    callEdges: dedupedCallEdges,
    importsV2: dedupedImports,
    structuralSummary: mergedSummary,
  }
}

/**
 * Merge per-chunk structural summaries into one.
 * Sums function/class/call-edge counts by language.
 *
 * @param {object[]} perChunkSummaries
 * @returns {object}
 */
function mergeStructuralSummaries(perChunkSummaries) {
  const byLanguage = {}
  let totalFunctions = 0
  let totalClasses = 0
  let totalCallEdges = 0

  for (const summary of perChunkSummaries) {
    if (!summary) continue
    totalFunctions += summary.total_functions || 0
    totalClasses += summary.total_classes || 0
    totalCallEdges += summary.total_call_edges || 0

    if (summary.by_language) {
      for (const [lang, stats] of Object.entries(summary.by_language)) {
        if (!byLanguage[lang]) {
          byLanguage[lang] = { functions: 0, classes: 0, callEdges: 0 }
        }
        byLanguage[lang].functions += stats.functions || 0
        byLanguage[lang].classes += stats.classes || 0
        byLanguage[lang].callEdges += stats.callEdges || 0
      }
    }
  }

  return {
    total_functions: totalFunctions,
    total_classes: totalClasses,
    total_call_edges: totalCallEdges,
    by_language: byLanguage,
  }
}
