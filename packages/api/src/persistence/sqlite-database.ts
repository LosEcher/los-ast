import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { PERSISTENCE_CONFIG } from '../config/index.js';

const SQLITE_DEFAULT_FILE = 'experimental-store.sqlite';
const SCHEMA_VERSIONS_TABLE = 'schema_versions';
const sqliteConnections = new Map<string, DatabaseSync>();
const sqliteTransactionDepth = new WeakMap<DatabaseSync, number>();

export interface SqliteMigration {
  version: number;
  up: (database: DatabaseSync) => void;
}

export interface SqliteDatabaseOptions {
  dir?: string;
  sqlitePath?: string;
}

export function resolveSqliteDatabasePath(options: SqliteDatabaseOptions = {}): string {
  const sqlitePath = options.sqlitePath ?? PERSISTENCE_CONFIG.experimentalSqlitePath ?? undefined;
  const dir = options.dir ?? PERSISTENCE_CONFIG.experimentalStoreDir ?? undefined;

  if (sqlitePath) {
    const resolvedPath = applyVitestWorkerSuffix(sqlitePath);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    return resolvedPath;
  }

  const targetDir = dir || path.join(process.cwd(), '.los-ast-state', 'api');
  fs.mkdirSync(targetDir, { recursive: true });
  return applyVitestWorkerSuffix(path.join(targetDir, SQLITE_DEFAULT_FILE));
}

export function createSqliteDatabase(options: SqliteDatabaseOptions = {}): DatabaseSync {
  const databasePath = resolveSqliteDatabasePath(options);
  const cached = sqliteConnections.get(databasePath);
  if (cached) {
    return cached;
  }

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
  sqliteConnections.set(databasePath, database);
  return database;
}

export async function runInSqliteTransaction<T>(
  callback: (database: DatabaseSync) => T | Promise<T>,
  options: SqliteDatabaseOptions = {}
): Promise<T> {
  const database = createSqliteDatabase(options);
  const depth = sqliteTransactionDepth.get(database) ?? 0;

  if (depth > 0) {
    sqliteTransactionDepth.set(database, depth + 1);
    try {
      return await callback(database);
    } finally {
      sqliteTransactionDepth.set(database, depth);
    }
  }

  sqliteTransactionDepth.set(database, 1);
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = await callback(database);
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  } finally {
    sqliteTransactionDepth.delete(database);
  }
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

export function applySqliteMigrations(
  database: DatabaseSync,
  schemaName: string,
  migrations: SqliteMigration[]
): void {
  ensureSchemaVersionsTable(database);
  validateMigrations(schemaName, migrations);

  const currentVersion = getSqliteSchemaVersion(database, schemaName);
  const pendingMigrations = migrations
    .filter((migration) => migration.version > currentVersion)
    .sort((left, right) => left.version - right.version);

  for (const migration of pendingMigrations) {
    database.exec('BEGIN IMMEDIATE');
    try {
      migration.up(database);
      setSqliteSchemaVersion(database, schemaName, migration.version);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }
}

export function getSqliteSchemaVersion(database: DatabaseSync, schemaName: string): number {
  ensureSchemaVersionsTable(database);
  const row = database
    .prepare(`SELECT version FROM ${SCHEMA_VERSIONS_TABLE} WHERE schema_name = ?`)
    .get(schemaName) as { version: number | bigint } | undefined;

  if (!row) {
    return 0;
  }

  return typeof row.version === 'bigint' ? Number(row.version) : row.version;
}

export function closeAllSqliteDatabases(): void {
  for (const database of sqliteConnections.values()) {
    sqliteTransactionDepth.delete(database);
    database.close();
  }
  sqliteConnections.clear();
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

function setSqliteSchemaVersion(database: DatabaseSync, schemaName: string, version: number): void {
  const existingVersion = getSqliteSchemaVersion(database, schemaName);

  if (existingVersion === 0) {
    database.prepare(`
      INSERT INTO ${SCHEMA_VERSIONS_TABLE} (schema_name, version, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `).run(schemaName, version);
    return;
  }

  database.prepare(`
    UPDATE ${SCHEMA_VERSIONS_TABLE}
    SET version = ?, updated_at = CURRENT_TIMESTAMP
    WHERE schema_name = ?
  `).run(version, schemaName);
}

function validateMigrations(schemaName: string, migrations: SqliteMigration[]): void {
  const sorted = [...migrations].sort((left, right) => left.version - right.version);
  let previousVersion = 0;

  for (const migration of sorted) {
    if (!Number.isInteger(migration.version) || migration.version <= 0) {
      throw new Error(`Invalid sqlite migration version for ${schemaName}: ${migration.version}`);
    }

    if (migration.version === previousVersion) {
      throw new Error(`Duplicate sqlite migration version for ${schemaName}: ${migration.version}`);
    }

    if (migration.version < previousVersion) {
      throw new Error(`Out-of-order sqlite migration version for ${schemaName}: ${migration.version}`);
    }

    previousVersion = migration.version;
  }
}

function applyVitestWorkerSuffix(databasePath: string): string {
  const workerId = process.env.VITEST_POOL_ID || process.env.VITEST_WORKER_ID;
  if (!workerId) {
    return databasePath;
  }

  const parsedPath = path.parse(databasePath);
  return path.join(parsedPath.dir, `${parsedPath.name}.worker-${workerId}${parsedPath.ext}`);
}
