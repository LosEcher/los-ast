/**
 * ScanPlanner — decides execution mode and produces a chunking plan.
 *
 * Modes:
 *   'single'    <100 files, sequential, zero overhead
 *   'parallel'  100-1000 files, bounded async concurrency
 *   'chunked'   >1000 files, phased Map → Reconcile → Reduce
 */

import { statSync } from 'node:fs'

/** @enum {string} */
export const ScanMode = Object.freeze({
  SINGLE: 'single',
  PARALLEL: 'parallel',
  CHUNKED: 'chunked',
})

const SMALL_MAX = 100
const MEDIUM_MAX = 1000
const DEFAULT_MAX_FILES_PER_CHUNK = 500
const DEFAULT_MAX_CHUNK_COST = 52428800 // 50MB cost-weighted

/**
 * Parser weights — relative cost of parsing different languages.
 * Heavier languages cost more to parse per byte.
 */
const PARSER_WEIGHTS = {
  typescript: 1.5,
  tsx: 1.5,
  rust: 1.5,
  python: 1.2,
  go: 1.2,
  javascript: 1.0,
  jsx: 1.0,
}

/**
 * Default: unknown languages get a moderate cost estimate
 */
const DEFAULT_PARSER_WEIGHT = 1.0

/**
 * Get the parser weight for a file path based on extension.
 * @param {string} filePath
 * @returns {number}
 */
export function getParserWeight(filePath) {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.ts')) return PARSER_WEIGHTS.typescript
  if (lower.endsWith('.tsx')) return PARSER_WEIGHTS.tsx
  if (lower.endsWith('.rs')) return PARSER_WEIGHTS.rust
  if (lower.endsWith('.py')) return PARSER_WEIGHTS.python
  if (lower.endsWith('.go')) return PARSER_WEIGHTS.go
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs'))
    return PARSER_WEIGHTS.javascript
  if (lower.endsWith('.jsx')) return PARSER_WEIGHTS.jsx
  return DEFAULT_PARSER_WEIGHT
}

/**
 * Estimate file sizes efficiently (sync stat for each file).
 * @param {string[]} files - absolute file paths
 * @returns {Map<string, {bytes: number, weight: number, cost: number}>}
 */
export function estimateFileCosts(files) {
  /** @type {Map<string, {bytes: number, weight: number, cost: number}>} */
  const costs = new Map()
  for (const file of files) {
    let bytes = 0
    try {
      bytes = statSync(file).size
    } catch {
      bytes = 4096 // fallback: assume 4KB
    }
    const weight = getParserWeight(file)
    const cost = bytes * weight
    costs.set(file, { bytes, weight, cost })
  }
  return costs
}

/**
 * Greedy bin-packing into chunks respecting both max files and max cost.
 * Files are assigned to the current chunk until either limit is hit.
 *
 * @param {string[]} files
 * @param {Map<string, {bytes: number, weight: number, cost: number}>} costs
 * @param {{ maxFilesPerChunk?: number, maxCostPerChunk?: number }} options
 * @returns {string[][]} - array of chunks, each chunk is an array of file paths
 */
export function chunkByCost(files, costs, {
  maxFilesPerChunk = DEFAULT_MAX_FILES_PER_CHUNK,
  maxCostPerChunk = DEFAULT_MAX_CHUNK_COST,
} = {}) {
  /** @type {string[][]} */
  const chunks = []
  /** @type {string[]} */
  let currentChunk = []
  let currentFileCount = 0
  let currentCost = 0

  for (const file of files) {
    const info = costs.get(file)
    const fileCost = info ? info.cost : 4096

    const wouldExceedFiles = currentFileCount >= maxFilesPerChunk
    const wouldExceedCost = currentCost + fileCost > maxCostPerChunk

    if ((wouldExceedFiles || wouldExceedCost) && currentChunk.length > 0) {
      chunks.push(currentChunk)
      currentChunk = []
      currentFileCount = 0
      currentCost = 0
    }

    currentChunk.push(file)
    currentFileCount++
    currentCost += fileCost
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk)
  }

  return chunks
}

/**
 * Determine the scan mode based on file count.
 *
 * @param {{ fileCount: number, totalCost?: number }} params
 * @returns {string} ScanMode value
 */
export function determineMode({ fileCount }) {
  if (fileCount < SMALL_MAX) return ScanMode.SINGLE
  if (fileCount < MEDIUM_MAX) return ScanMode.PARALLEL
  return ScanMode.CHUNKED
}

/**
 * Build a complete scan plan: mode + chunks + concurrency level.
 *
 * @param {object} params
 * @param {string[]} params.files
 * @param {string} params.rootDir
 * @param {number} [params.maxFilesPerChunk]
 * @param {number} [params.maxCostPerChunk]
 * @param {number} [params.maxParallelChunks]
 * @returns {{ mode: string, chunks: string[][], maxConcurrency: number, fileCount: number, totalCost: number }}
 */
export function planScan({
  files,
  rootDir: _rootDir,
  maxFilesPerChunk = DEFAULT_MAX_FILES_PER_CHUNK,
  maxCostPerChunk = DEFAULT_MAX_CHUNK_COST,
  maxParallelChunks = 4,
}) {
  const fileCount = files.length
  const mode = determineMode({ fileCount })

  /** @type {Map<string, {bytes: number, weight: number, cost: number}>} */
  let costMap = new Map()
  let totalCost = 0

  if (mode === ScanMode.SINGLE) {
    // Skip cost estimation for small projects — keep startup fast
    return {
      mode,
      chunks: [files],
      maxConcurrency: 1,
      fileCount,
      totalCost: 0,
    }
  }

  // Estimate costs for chunking
  costMap = estimateFileCosts(files)
  totalCost = [...costMap.values()].reduce((sum, c) => sum + c.cost, 0)

  const chunks = chunkByCost(files, costMap, {
    maxFilesPerChunk,
    maxCostPerChunk,
  })

  const concurrency =
    mode === ScanMode.CHUNKED
      ? Math.min(maxParallelChunks, chunks.length)
      : Math.min(Math.max(3, maxParallelChunks), chunks.length)

  return {
    mode,
    chunks,
    maxConcurrency: concurrency,
    fileCount,
    totalCost,
  }
}
