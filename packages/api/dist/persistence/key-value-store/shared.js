import path from 'node:path';
export const STORE_SCHEMA_VERSION = 1;
export const keyValueStoreMigrations = [
    {
        version: 1,
        up(database) {
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
export function sanitizeStoreName(name) {
    return name.replace(/[^a-z0-9._-]+/giu, '_');
}
export function resolveJsonStoreFilePath(name, targetDir) {
    return path.join(targetDir, `${sanitizeStoreName(name)}.json`);
}
export function parseSerializedStore(raw, filePath) {
    const parsed = JSON.parse(raw);
    if (!parsed ||
        typeof parsed !== 'object' ||
        parsed.version !== STORE_SCHEMA_VERSION ||
        !parsed.items ||
        typeof parsed.items !== 'object' ||
        Array.isArray(parsed.items)) {
        throw new Error(`Unsupported store payload shape or version in ${filePath}`);
    }
    return parsed.items;
}
export function buildSerializedStorePayload(entries) {
    return {
        version: STORE_SCHEMA_VERSION,
        items: Object.fromEntries(entries),
    };
}
export function buildTempStorePath(filePath, pid = process.pid, now = Date.now()) {
    return `${filePath}.${pid}.${now}.tmp`;
}
export function buildQuarantineStorePath(filePath, now = Date.now()) {
    return `${filePath}.corrupt-${now}`;
}
export function toSqliteCount(value) {
    return typeof value === 'bigint' ? Number(value) : value;
}
export function parseStoredJsonValue({ rawValue, onInvalid, }) {
    if (rawValue === undefined) {
        return undefined;
    }
    try {
        return JSON.parse(rawValue);
    }
    catch (error) {
        onInvalid?.(error);
        return undefined;
    }
}
export function resolveKeyValueStoreOptions(options, defaults) {
    return {
        backend: options.backend ?? defaults.experimentalStoreBackend,
        dir: options.dir ?? defaults.experimentalStoreDir ?? undefined,
        sqlitePath: options.sqlitePath ?? defaults.experimentalSqlitePath ?? undefined,
    };
}
