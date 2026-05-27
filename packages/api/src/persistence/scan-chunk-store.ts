/**
 * SqliteIntermediateStore — SQLite-backed storage for intermediate chunk results.
 *
 * Follows the same patterns as other API persistence modules:
 * DatabaseSync + STRICT tables + migration system + factory function.
 */

import type { DatabaseSync } from 'node:sqlite'
import { applySqliteMigrations } from './sqlite-database.js'

export const SCHEMA_NAME = 'scan_chunks'

/**
 * Migration definitions for the scan_chunks schema.
 * Version 1: initial table with chunk result JSON storage.
 */
export const scanChunksMigrations = [
  {
    version: 1,
    up(database: DatabaseSync) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS scan_chunks (
          chunk_id TEXT PRIMARY KEY,
          result_json TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ) STRICT
      `)
      database.exec(`
        CREATE INDEX IF NOT EXISTS scan_chunks_created_idx ON scan_chunks (created_at)
      `)
    },
  },
]

/**
 * Parse a stored JSON value, returning undefined on any failure.
 */
function parseStoredJson<T>(raw: string | undefined): T | undefined {
  if (raw === undefined) return undefined
  try {
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

/**
 * Result shape stored per chunk — mirrors ChunkResult from core's reducer.mjs.
 */
export interface StoredChunkResult {
  chunkId: string
  filesScanned: number
  findings: unknown[]
  parseFailures: unknown[]
  costStats: { parsedOk: number; parseFailed: number }
}

/**
 * SQLite-backed intermediate chunk store.
 *
 * Implements the same interface as core's IntermediateStore so the chunked
 * scanner can swap between filesystem (CLI) and SQLite (API) transparently.
 */
export class SqliteIntermediateStore {
  /** @type {DatabaseSync} */
  _database: DatabaseSync

  constructor(database: DatabaseSync) {
    this._database = database
    applySqliteMigrations(this._database, SCHEMA_NAME, scanChunksMigrations)
  }

  /**
   * Save a single chunk result as a JSON row.
   */
  saveChunkResult(chunkId: string, result: StoredChunkResult): void {
    const resultJson = JSON.stringify(result)
    this._database
      .prepare(
        `INSERT INTO scan_chunks (chunk_id, result_json)
         VALUES (?, ?)
         ON CONFLICT(chunk_id)
         DO UPDATE SET result_json = excluded.result_json,
                       created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      )
      .run(chunkId, resultJson)
  }

  /**
   * Load all saved chunk results, ordered by chunk_id for deterministic output.
   */
  loadAllChunkResults(): StoredChunkResult[] {
    const rows = this._database
      .prepare('SELECT result_json FROM scan_chunks ORDER BY chunk_id')
      .all() as Array<{ result_json: string }>

    const results: StoredChunkResult[] = []
    for (const row of rows) {
      const parsed = parseStoredJson<StoredChunkResult>(row.result_json)
      if (parsed) {
        results.push(parsed)
      }
    }
    return results
  }

  /**
   * Remove all intermediate chunk data for this scan.
   */
  cleanup(): void {
    this._database.exec('DELETE FROM scan_chunks')
  }
}

/**
 * Resolved options for creating a SqliteIntermediateStore.
 */
export interface SqliteStoreOptions {
  database: DatabaseSync
}

/**
 * Factory: create a SqliteIntermediateStore backed by an existing DatabaseSync.
 *
 * The caller is responsible for running applySqliteMigrations with
 * scanChunksMigrations before using the store.
 */
export function createSqliteIntermediateStore(options: SqliteStoreOptions): SqliteIntermediateStore {
  return new SqliteIntermediateStore(options.database)
}
