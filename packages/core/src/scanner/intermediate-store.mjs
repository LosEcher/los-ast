/**
 * IntermediateStore — abstraction for persisting intermediate chunk results.
 *
 * - FilesystemIntermediateStore: temp directory with JSONL files (CLI path)
 * - Factory: createIntermediateStore(type, options?)
 */

import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

/**
 * Abstract interface for intermediate chunk storage.
 * Concrete implementations handle filesystem or SQLite persistence.
 */
export class IntermediateStore {
  /**
   * Save a single chunk result.
   * @param {string} chunkId
   * @param {Promise<import('./reducer.mjs').ChunkResult> | import('./reducer.mjs').ChunkResult} result
   * @returns {Promise<void>}
   */
  async saveChunkResult(_chunkId, _result) {
    throw new Error('Not implemented')
  }

  /**
   * Load all saved chunk results.
   * @returns {Promise<import('./reducer.mjs').ChunkResult[]>}
   */
  async loadAllChunkResults() {
    throw new Error('Not implemented')
  }

  /**
   * Remove all intermediate data.
   * @returns {Promise<void>}
   */
  async cleanup() {
    throw new Error('Not implemented')
  }
}

/**
 * Filesystem-backed intermediate store.
 * Each chunk is written as a JSON file in a temp directory.
 */
export class FilesystemIntermediateStore extends IntermediateStore {
  /** @type {string} */
  _dir

  constructor() {
    super()
    this._dir = join(tmpdir(), `los-ast-chunks-${randomUUID()}`)
  }

  async saveChunkResult(chunkId, result) {
    if (!existsSync(this._dir)) {
      mkdirSync(this._dir, { recursive: true })
    }
    const data = JSON.stringify(result)
    writeFileSync(join(this._dir, `chunk-${chunkId}.json`), data, 'utf-8')
  }

  async loadAllChunkResults() {
    if (!existsSync(this._dir)) return []

    const { readdirSync } = await import('node:fs')
    const files = readdirSync(this._dir).filter((f) => f.startsWith('chunk-') && f.endsWith('.json'))

    /** @type {import('./reducer.mjs').ChunkResult[]} */
    const results = []
    for (const file of files.sort()) {
      try {
        const data = readFileSync(join(this._dir, file), 'utf-8')
        results.push(JSON.parse(data))
      } catch {
        // Skip corrupted chunk files
      }
    }
    return results
  }

  async cleanup() {
    if (existsSync(this._dir)) {
      try {
        rmSync(this._dir, { recursive: true, force: true })
      } catch {
        // Best-effort cleanup
      }
    }
  }
}

/**
 * Factory: create an intermediate store.
 *
 * @param {'filesystem' | 'sqlite'} type
 * @param {object} [options]
 * @returns {IntermediateStore}
 */
export function createIntermediateStore(type = 'filesystem', options = {}) {
  switch (type) {
    case 'sqlite':
      // Lazy-imported to avoid API dependency in core
      // In practice this is provided by the API layer via dependency injection
      throw new Error(
        'SQLite intermediate store requires @los-ast/api. Use FilesystemIntermediateStore or inject an implementation.',
      )
    case 'filesystem':
    default:
      return new FilesystemIntermediateStore()
  }
}
