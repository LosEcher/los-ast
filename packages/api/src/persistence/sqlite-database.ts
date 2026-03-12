import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { PERSISTENCE_CONFIG } from '../config/index.js';

const SQLITE_DEFAULT_FILE = 'experimental-store.sqlite';

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
  database.exec('PRAGMA journal_mode = WAL');
  return database;
}
