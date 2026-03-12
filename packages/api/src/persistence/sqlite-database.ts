import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { PERSISTENCE_CONFIG } from '../config/index.js';

const SQLITE_DEFAULT_FILE = 'experimental-store.sqlite';
const SCHEMA_VERSIONS_TABLE = 'schema_versions';

export interface SqliteDatabaseOptions {
  dir?: string;
  sqlitePath?: string;
}

export function resolveSqliteDatabasePath(options: SqliteDatabaseOptions = {}): string {
  const sqlitePath = options.sqlitePath ?? PERSISTENCE_CONFIG.experimentalSqlitePath ?? undefined;
  const dir = options.dir ?? PERSISTENCE_CONFIG.experimentalStoreDir ?? undefined;

  if (sqlitePath) {
    fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
    return sqlitePath;
  }

  const targetDir = dir || path.join(process.cwd(), '.los-ast-state', 'api');
  fs.mkdirSync(targetDir, { recursive: true });
  return path.join(targetDir, SQLITE_DEFAULT_FILE);
}

export function createSqliteDatabase(options: SqliteDatabaseOptions = {}): DatabaseSync {
  const databasePath = resolveSqliteDatabasePath(options);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const database = new DatabaseSync(databasePath, {
    enableForeignKeyConstraints: true,
    timeout: 5000,
  });
  try {
    database.exec('PRAGMA journal_mode = WAL');
  } catch (error) {
    if (!(error instanceof Error) || !error.message.toLowerCase().includes('database is locked')) {
      throw error;
    }
  }
  ensureSchemaVersionsTable(database);
  return database;
}

export function registerSqliteSchemaVersion(
  database: DatabaseSync,
  schemaName: string,
  version: number
): void {
  ensureSchemaVersionsTable(database);

  const existing = database
    .prepare(`SELECT version FROM ${SCHEMA_VERSIONS_TABLE} WHERE schema_name = ?`)
    .get(schemaName) as { version: number | bigint } | undefined;

  const existingVersion = existing
    ? (typeof existing.version === 'bigint' ? Number(existing.version) : existing.version)
    : undefined;

  if (existingVersion === undefined) {
    database.prepare(`
      INSERT INTO ${SCHEMA_VERSIONS_TABLE} (schema_name, version, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `).run(schemaName, version);
    return;
  }

  if (existingVersion < version) {
    database.prepare(`
      UPDATE ${SCHEMA_VERSIONS_TABLE}
      SET version = ?, updated_at = CURRENT_TIMESTAMP
      WHERE schema_name = ?
    `).run(version, schemaName);
  }
}

function ensureSchemaVersionsTable(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA_VERSIONS_TABLE} (
      schema_name TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT
  `);
}
