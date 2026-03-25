import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

export type SerializedStore<T> = {
  version: 1;
  items: Record<string, T>;
};

export const STORE_SCHEMA_VERSION = 1;

export const keyValueStoreMigrations = [
  {
    version: 1,
    up(database: DatabaseSync) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS key_value_store (
          namespace TEXT NOT NULL,
          item_key TEXT NOT NULL,
          value_json TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (namespace, item_key)
        ) STRICT
      `);
    },
  },
];

export function sanitizeStoreName(name: string) {
  return name.replace(/[^a-z0-9._-]+/giu, '_');
}

export function resolveJsonStoreFilePath(name: string, targetDir: string) {
  return path.join(targetDir, `${sanitizeStoreName(name)}.json`);
}

export function parseSerializedStore<T>(raw: string, filePath: string): Record<string, T> {
  const parsed = JSON.parse(raw) as SerializedStore<T>;
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    parsed.version !== STORE_SCHEMA_VERSION ||
    !parsed.items ||
    typeof parsed.items !== 'object' ||
    Array.isArray(parsed.items)
  ) {
    throw new Error(`Unsupported store payload shape or version in ${filePath}`);
  }

  return parsed.items;
}

export function buildSerializedStorePayload<T>(entries: Array<[string, T]>): SerializedStore<T> {
  return {
    version: STORE_SCHEMA_VERSION,
    items: Object.fromEntries(entries),
  };
}

export function buildTempStorePath(filePath: string, pid = process.pid, now = Date.now()) {
  return `${filePath}.${pid}.${now}.tmp`;
}

export function buildQuarantineStorePath(filePath: string, now = Date.now()) {
  return `${filePath}.corrupt-${now}`;
}

export function toSqliteCount(value: number | bigint) {
  return typeof value === 'bigint' ? Number(value) : value;
}

export function parseStoredJsonValue<T>({
  rawValue,
  onInvalid,
}: {
  rawValue: string | undefined;
  onInvalid?: (error: unknown) => void;
}): T | undefined {
  if (rawValue === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch (error) {
    onInvalid?.(error);
    return undefined;
  }
}

export interface KeyValueStoreResolvedOptions {
  backend: 'memory' | 'file' | 'sqlite';
  dir?: string;
  sqlitePath?: string;
}

export interface KeyValueStoreOptionOverrides {
  backend?: 'memory' | 'file' | 'sqlite';
  dir?: string;
  sqlitePath?: string;
}

export interface KeyValueStoreConfigDefaults {
  experimentalStoreBackend: 'memory' | 'file' | 'sqlite';
  experimentalStoreDir?: string | null;
  experimentalSqlitePath?: string | null;
}

export function resolveKeyValueStoreOptions(
  options: KeyValueStoreOptionOverrides,
  defaults: KeyValueStoreConfigDefaults
): KeyValueStoreResolvedOptions {
  return {
    backend: options.backend ?? defaults.experimentalStoreBackend,
    dir: options.dir ?? defaults.experimentalStoreDir ?? undefined,
    sqlitePath: options.sqlitePath ?? defaults.experimentalSqlitePath ?? undefined,
  };
}
