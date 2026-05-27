/**
 * ChunkedScanner — executes scan on a single chunk of files.
 * Delegates to _scanSequential for the actual scan loop.
 */

import { _scanSequential } from '../runner/scan.mjs'
import { createParseCache, DEFAULT_PARSE_CACHE_MAX_ENTRIES } from '../parse-cache.mjs'

/**
 * Scan a single chunk of files.
 *
 * @param {object} params
 * @param {string} params.chunkId - unique chunk identifier
 * @param {string[]} params.chunkFiles - absolute file paths in this chunk
 * @param {string} params.project
 * @param {import('../runner/scan.mjs').Rule[]} params.rules
 * @param {boolean} [params.deterministic]
 * @param {AbortSignal} [params.signal]
 * @param {number} [params.parseCacheSize]
 * @returns {Promise<import('./reducer.mjs').ChunkResult>}
 */
export async function scanChunk({
  chunkId,
  chunkFiles,
  project = 'custom',
  rules = [],
  deterministic = false,
  signal,
  parseCacheSize = DEFAULT_PARSE_CACHE_MAX_ENTRIES,
}) {
  const parseCache = createParseCache({ maxEntries: parseCacheSize })

  const { findings, parseFailures } = await _scanSequential(chunkFiles, {
    project,
    rules,
    parseCache,
    signal,
    deterministic,
  })

  return {
    chunkId,
    filesScanned: chunkFiles.length,
    findings,
    parseFailures,
    costStats: {
      parsedOk: chunkFiles.length - parseFailures.length,
      parseFailed: parseFailures.length,
    },
  }
}
