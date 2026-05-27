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

/**
 * Sequential scan over an already-discovered file list.
 * This is the canonical single-process scan body, also used by
 * ChunkedScanner.scanChunk for individual chunk processing.
 *
 * @param {string[]} files - absolute file paths
 * @param {object} options
 * @param {string} [options.project]
 * @param {import('../scanner/scan-planner.mjs').Rule[]} [options.rules]
 * @param {object} [options.parseCache]
 * @param {AbortSignal} [options.signal]
 * @param {boolean} [options.deterministic]
 * @returns {{ findings: object[], parseFailures: object[] }}
 */
export async function _scanSequential(files, {
  project = 'custom',
  rules = [],
  parseCache = defaultParseCache,
  signal,
  deterministic = false,
} = {}) {
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
      let nodes
      try {
        nodes = root.findAll({ rule: rule.rule })
      } catch {
        continue
      }
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

  return { findings, parseFailures }
}

/**
 * Main scan entry point. By default ('auto' mode) auto-promotes:
 *   <100 files → sequential (zero overhead)
 *   100-1000 files → bounded parallel chunks
 *   >1000 files → phased chunked Map-Reduce
 *
 * @param {object} options
 * @param {string} [options.project]
 * @param {string} options.rootDir
 * @param {string[]} [options.include]
 * @param {string[]} [options.ignore]
 * @param {import('../scanner/scan-planner.mjs').Rule[]} [options.rules]
 * @param {object} [options.parseCache]
 * @param {boolean} [options.includeStats]
 * @param {AbortSignal} [options.signal]
 * @param {boolean} [options.deterministic]
 * @param {'auto' | 'single' | 'parallel' | 'chunked'} [options.mode]
 */
export async function scan({
  project = 'custom',
  rootDir,
  include,
  ignore,
  rules = [],
  parseCache = defaultParseCache,
  includeStats = false,
  signal,
  deterministic = false,
  mode = 'auto',
}) {
  registerLanguages()
  throwIfAborted(signal)

  const files = await discoverFiles({ rootDir, include, ignore })

  // ── Small project or explicit single mode: sequential path ──
  const shouldUseSequential =
    mode === 'single' ||
    (mode === 'auto' && files.length < 100)

  if (shouldUseSequential) {
    const { findings, parseFailures } = await _scanSequential(files, {
      project,
      rules,
      parseCache,
      signal,
      deterministic,
    })

    if (deterministic) {
      findings.sort(deterministicSort)
    }

    const res = { filesScanned: files.length, findings }
    if (includeStats) {
      res.parseCache = parseCache.snapshotStats
        ? parseCache.snapshotStats()
        : undefined
      const parseFailureSummary = summarizeParseFailures(parseFailures)
      if (parseFailureSummary) {
        res.parseFailures = parseFailureSummary
      }
    }
    return res
  }

  // ── Medium/Large project: chunked execution ──
  const { planScan } = await import('../scanner/scan-planner.mjs')
  const { scanChunk } = await import('../scanner/chunked-scanner.mjs')
  const { executeParallel } = await import('../scanner/parallel-executor.mjs')
  const { reduceChunks } = await import('../scanner/reducer.mjs')

  const plan = planScan({
    files,
    rootDir,
    maxParallelChunks: mode === 'parallel' ? 4 : undefined,
  })

  throwIfAborted(signal)

  // Execute chunks with bounded parallelism
  const chunkResults = await executeParallel({
    chunks: plan.chunks.map((chunkFiles, i) => ({
      id: `chunk-${String(i).padStart(3, '0')}`,
      files: chunkFiles,
    })),
    maxConcurrency: plan.maxConcurrency,
    signal,
    workerFn: async (chunk, _index, chunkSignal) => {
      const chunkResult = await scanChunk({
        chunkId: chunk.id,
        chunkFiles: chunk.files,
        project,
        rules,
        deterministic: false, // Sort in reduce phase
        signal: chunkSignal,
      })
      return chunkResult
    },
  })

  throwIfAborted(signal)

  // Reduce: merge, dedup, sort
  const merged = await reduceChunks({
    chunkResults,
    deterministic,
    includeStats,
  })

  // Build final result in the same shape as before
  const res = {
    filesScanned: merged.filesScanned,
    findings: merged.findings,
  }

  if (includeStats) {
    res.parseCache = parseCache.snapshotStats
      ? parseCache.snapshotStats()
      : undefined
    if (merged.parseFailures) {
      res.parseFailures = merged.parseFailures
    }
    res._scanMode = {
      mode: plan.mode,
      chunks: plan.chunks.length,
      concurrency: plan.maxConcurrency,
    }
    if (merged._reduceStats) {
      res._reduceStats = merged._reduceStats
    }
  }

  return res
}
