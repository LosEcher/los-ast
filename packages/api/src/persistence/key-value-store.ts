import fs from 'node:fs';
import path from 'node:path';

import { PERSISTENCE_CONFIG } from '../config/index.js';
import { createSqliteDatabase } from './sqlite-database.js';

export type KeyValueStoreBackend = 'memory' | 'file' | 'sqlite';

export interface KeyValueStore<T> {
  get(key: string): T | undefined;
  has(key: string): boolean;
  set(key: string, value: T): void;
  delete(key: string): boolean;
  values(): T[];
  entries(): Array<[string, T]>;
  clear(): void;
  size(): number;
}

export interface KeyValueStoreOptions {
  backend?: KeyValueStoreBackend;
  dir?: string;
  sqlitePath?: string;
}

type SerializedStore<T> = {
  version: 1;
  items: Record<string, T>;
};

const STORE_SCHEMA_VERSION = 1;

class InMemoryKeyValueStore<T> implements KeyValueStore<T> {
  private readonly store = new Map<string, T>();

  get(key: string): T | undefined {
    return this.store.get(key);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  set(key: string, value: T): void {
    this.store.set(key, value);
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  values(): T[] {
    return Array.from(this.store.values());
  }

  entries(): Array<[string, T]> {
    return Array.from(this.store.entries());
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

class JsonFileKeyValueStore<T> implements KeyValueStore<T> {
  private readonly filePath: string;
  private readonly store = new Map<string, T>();

  constructor(name: string, dir?: string) {
    const targetDir = dir || path.join(process.cwd(), '.los-ast-state', 'api');
    const safeName = name.replace(/[^a-z0-9._-]+/giu, '_');
    this.filePath = path.join(targetDir, `${safeName}.json`);
    this.load();
  }

  get(key: string): T | undefined {
    return this.store.get(key);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  set(key: string, value: T): void {
    this.store.set(key, value);
    this.flush();
  }

  delete(key: string): boolean {
    const removed = this.store.delete(key);
    if (removed) {
      this.flush();
    }
    return removed;
  }

  values(): T[] {
    return Array.from(this.store.values());
  }

  entries(): Array<[string, T]> {
    return Array.from(this.store.entries());
  }

  clear(): void {
    this.store.clear();
    this.flush();
  }

  size(): number {
    return this.store.size;
  }

  private load(): void {
    if (!fs.existsSync(this.filePath)) {
      return;
    }

    const raw = fs.readFileSync(this.filePath, 'utf8');
    if (!raw.trim()) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as SerializedStore<T>;
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        parsed.version !== STORE_SCHEMA_VERSION ||
        !parsed.items ||
        typeof parsed.items !== 'object' ||
        Array.isArray(parsed.items)
      ) {
        throw new Error(`Unsupported store payload shape or version in ${this.filePath}`);
      }

      for (const [key, value] of Object.entries(parsed.items)) {
        this.store.set(key, value);
      }
    } catch (error) {
      this.quarantineCorruptedFile(error);
    }
  }

  private flush(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const payload: SerializedStore<T> = {
      version: STORE_SCHEMA_VERSION,
      items: Object.fromEntries(this.store.entries()),
    };
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(tempPath, this.filePath);
  }

  private quarantineCorruptedFile(error: unknown): void {
    const quarantinePath = `${this.filePath}.corrupt-${Date.now()}`;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.renameSync(this.filePath, quarantinePath);
    console.warn(
      `[Persistence] Quarantined corrupted store ${this.filePath} -> ${quarantinePath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

type SqliteRow = {
  value_json: string;
};

class SqliteKeyValueStore<T> implements KeyValueStore<T> {
  private readonly database;

  constructor(
    private readonly name: string,
    private readonly sqlitePath?: string,
    private readonly dir?: string
  ) {
    this.database = createSqliteDatabase({
      dir: this.dir,
      sqlitePath: this.sqlitePath,
    });
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS key_value_store (
        namespace TEXT NOT NULL,
        item_key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (namespace, item_key)
      ) STRICT
    `);
  }

  get(key: string): T | undefined {
    const row = this.database
      .prepare(
        'SELECT value_json FROM key_value_store WHERE namespace = ? AND item_key = ?'
      )
      .get(this.name, key) as SqliteRow | undefined;
    return this.parseRowValue(key, row?.value_json);
  }

  has(key: string): boolean {
    const row = this.database
      .prepare(
        'SELECT COUNT(*) as count FROM key_value_store WHERE namespace = ? AND item_key = ?'
      )
      .get(this.name, key) as { count: number | bigint };
    const count = typeof row.count === 'bigint' ? Number(row.count) : row.count;
    return count > 0;
  }

  set(key: string, value: T): void {
    const serialized = JSON.stringify(value);
    this.database
      .prepare(`
        INSERT INTO key_value_store (namespace, item_key, value_json, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(namespace, item_key)
        DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP
      `)
      .run(this.name, key, serialized);
  }

  delete(key: string): boolean {
    const result = this.database
      .prepare('DELETE FROM key_value_store WHERE namespace = ? AND item_key = ?')
      .run(this.name, key);
    return Number(result.changes ?? 0) > 0;
  }

  values(): T[] {
    const rows = this.database
      .prepare(
        'SELECT item_key, value_json FROM key_value_store WHERE namespace = ? ORDER BY item_key'
      )
      .all(this.name) as Array<{ item_key: string; value_json: string }>;

    return rows
      .map((row) => this.parseRowValue(row.item_key, row.value_json))
      .filter((value): value is T => value !== undefined);
  }

  entries(): Array<[string, T]> {
    const rows = this.database
      .prepare(
        'SELECT item_key, value_json FROM key_value_store WHERE namespace = ? ORDER BY item_key'
      )
      .all(this.name) as Array<{ item_key: string; value_json: string }>;

    return rows.flatMap((row) => {
      const value = this.parseRowValue(row.item_key, row.value_json);
      return value === undefined ? [] : [[row.item_key, value] as [string, T]];
    });
  }

  clear(): void {
    this.database.prepare('DELETE FROM key_value_store WHERE namespace = ?').run(this.name);
  }

  size(): number {
    const row = this.database
      .prepare('SELECT COUNT(*) as count FROM key_value_store WHERE namespace = ?')
      .get(this.name) as { count: number | bigint };
    return typeof row.count === 'bigint' ? Number(row.count) : row.count;
  }

  private parseRowValue(key: string, rawValue: string | undefined): T | undefined {
    if (rawValue === undefined) {
      return undefined;
    }

    try {
      return JSON.parse(rawValue) as T;
    } catch (error) {
      console.warn(
        `[Persistence] Ignoring invalid JSON payload in sqlite store "${this.name}" for key "${key}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return undefined;
    }
  }
}

export function createKeyValueStore<T>(
  name: string,
  options: KeyValueStoreOptions = {}
): KeyValueStore<T> {
  const backend = options.backend ?? PERSISTENCE_CONFIG.experimentalStoreBackend;
  const dir = options.dir ?? PERSISTENCE_CONFIG.experimentalStoreDir ?? undefined;
  const sqlitePath = options.sqlitePath ?? PERSISTENCE_CONFIG.experimentalSqlitePath ?? undefined;

  if (backend === 'file') {
    return new JsonFileKeyValueStore<T>(name, dir);
  }

  if (backend === 'sqlite') {
    return new SqliteKeyValueStore<T>(name, sqlitePath, dir);
  }

  return new InMemoryKeyValueStore<T>();
}
