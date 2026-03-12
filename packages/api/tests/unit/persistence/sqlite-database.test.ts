import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import {
  applySqliteMigrations,
  closeAllSqliteDatabases,
  createSqliteDatabase,
  getSqliteSchemaVersion,
} from '../../../src/persistence/sqlite-database.js';

const tempDirs: string[] = [];

afterEach(() => {
  closeAllSqliteDatabases();
  while (tempDirs.length > 0) {
    const target = tempDirs.pop();
    if (target && fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
});

describe('sqlite database migrations', () => {
  it('should apply pending migrations and record schema versions', () => {
    const { database } = createTempDatabase();

    applySqliteMigrations(database, 'test_schema', [
      {
        version: 1,
        up(db: DatabaseSync) {
          db.exec('CREATE TABLE IF NOT EXISTS test_items (id TEXT PRIMARY KEY) STRICT');
        },
      },
      {
        version: 2,
        up(db: DatabaseSync) {
          db.exec('CREATE INDEX IF NOT EXISTS test_items_id_idx ON test_items (id)');
        },
      },
    ]);

    expect(getSqliteSchemaVersion(database, 'test_schema')).toBe(2);
    const row = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'test_items'")
      .get() as { name: string } | undefined;
    expect(row?.name).toBe('test_items');
  });

  it('should not rerun migrations that are already applied', () => {
    const { database } = createTempDatabase();
    let executed = 0;

    const migrations = [
      {
        version: 1,
        up(db: DatabaseSync) {
          executed += 1;
          db.exec('CREATE TABLE IF NOT EXISTS rerun_items (id TEXT PRIMARY KEY) STRICT');
        },
      },
    ];

    applySqliteMigrations(database, 'rerun_schema', migrations);
    applySqliteMigrations(database, 'rerun_schema', migrations);

    expect(executed).toBe(1);
    expect(getSqliteSchemaVersion(database, 'rerun_schema')).toBe(1);
  });

  it('should rollback failed migrations without advancing schema version', () => {
    const { database } = createTempDatabase();

    expect(() => applySqliteMigrations(database, 'broken_schema', [
      {
        version: 1,
        up(db: DatabaseSync) {
          db.exec('CREATE TABLE IF NOT EXISTS broken_items (id TEXT PRIMARY KEY) STRICT');
          throw new Error('boom');
        },
      },
    ])).toThrow('boom');

    expect(getSqliteSchemaVersion(database, 'broken_schema')).toBe(0);
    const row = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'broken_items'")
      .get() as { name: string } | undefined;
    expect(row).toBeUndefined();
  });
});

function createTempDatabase(): { dir: string; database: DatabaseSync } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'los-ast-sqlite-'));
  tempDirs.push(dir);

  return {
    dir,
    database: createSqliteDatabase({
      sqlitePath: path.join(dir, 'state.sqlite'),
    }),
  };
}
