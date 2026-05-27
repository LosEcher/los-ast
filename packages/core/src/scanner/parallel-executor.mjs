/**
 * ParallelExecutor — bounded async concurrency for chunk execution.
 * Uses a semaphore pattern to limit concurrent chunk processing.
 */

/**
 * Execute multiple async tasks with bounded concurrency.
 *
 * @param {object} params
 * @param {import('./scan-planner.mjs').ScanChunk[]} params.chunks
 * @param {(chunk: import('./scan-planner.mjs').ScanChunk, index: number, signal: AbortSignal) => Promise<import('./reducer.mjs').ChunkResult>} params.workerFn
 * @param {number} [params.maxConcurrency]
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<import('./reducer.mjs').ChunkResult[]>}
 */
export async function executeParallel({ chunks, workerFn, maxConcurrency = 4, signal }) {
  if (chunks.length === 0) return []

  // Single chunk: no parallelism needed
  if (chunks.length === 1) {
    const result = await workerFn(chunks[0], 0, signal || new AbortController().signal)
    return [result]
  }

  const results = new Array(chunks.length)
  let nextIndex = 0
  let aborted = false

  const onAbort = () => {
    aborted = true
  }

  if (signal) {
    if (signal.aborted) {
      return results.filter(Boolean) // Return what we have (likely empty)
    }
    signal.addEventListener('abort', onAbort, { once: true })
  }

  /**
   * Worker loop: claim next chunk, execute, store result.
   */
  async function worker(workerId) {
    while (nextIndex < chunks.length && !aborted) {
      const index = nextIndex++
      if (index >= chunks.length) break

      if (signal?.aborted) break

      try {
        results[index] = await workerFn(chunks[index], index, signal || new AbortController().signal)
      } catch (error) {
        if (error.name === 'AbortError' || error.code === 'ABORTED') {
          // Chunk was cancelled — leave result slot empty
          continue
        }
        // Non-abort errors: store as parse-failure-heavy result and continue
        results[index] = {
          chunkId: `chunk-${index}-error`,
          filesScanned: chunks[index].length,
          findings: [],
          parseFailures: chunks[index].map((f) => ({
            file: f,
            language: 'unknown',
            error: error instanceof Error ? error.message : String(error),
          })),
          costStats: { parsedOk: 0, parseFailed: chunks[index].length },
        }
      }
    }
  }

  // Start worker pool
  const numWorkers = Math.min(maxConcurrency, chunks.length)
  const workers = []
  for (let i = 0; i < numWorkers; i++) {
    workers.push(worker(i))
  }

  await Promise.all(workers)

  if (signal) {
    signal.removeEventListener('abort', onAbort)
  }

  return results.filter(Boolean)
}
