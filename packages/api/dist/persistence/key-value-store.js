import fs from 'node:fs';
import path from 'node:path';
import { PERSISTENCE_CONFIG } from '../config/index.js';
import { applySqliteMigrations, createSqliteDatabase } from './sqlite-database.js';
const STORE_SCHEMA_VERSION = 1;
const keyValueStoreMigrations = [
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
class InMemoryKeyValueStore {
    store = new Map();
    get(key) {
        return this.store.get(key);
    }
    has(key) {
        return this.store.has(key);
    }
    set(key, value) {
        this.store.set(key, value);
    }
    delete(key) {
        return this.store.delete(key);
    }
    values() {
        return Array.from(this.store.values());
    }
    entries() {
        return Array.from(this.store.entries());
    }
    clear() {
        this.store.clear();
    }
    size() {
        return this.store.size;
    }
}
class JsonFileKeyValueStore {
    filePath;
    store = new Map();
    constructor(name, dir) {
        const targetDir = dir || path.join(process.cwd(), '.los-ast-state', 'api');
        const safeName = name.replace(/[^a-z0-9._-]+/giu, '_');
        this.filePath = path.join(targetDir, `${safeName}.json`);
        this.load();
    }
    get(key) {
        return this.store.get(key);
    }
    has(key) {
        return this.store.has(key);
    }
    set(key, value) {
        this.store.set(key, value);
        this.flush();
    }
    delete(key) {
        const removed = this.store.delete(key);
        if (removed) {
            this.flush();
        }
        return removed;
    }
    values() {
        return Array.from(this.store.values());
    }
    entries() {
        return Array.from(this.store.entries());
    }
    clear() {
        this.store.clear();
        this.flush();
    }
    size() {
        return this.store.size;
    }
    load() {
        if (!fs.existsSync(this.filePath)) {
            return;
        }
        const raw = fs.readFileSync(this.filePath, 'utf8');
        if (!raw.trim()) {
            return;
        }
        try {
            const parsed = JSON.parse(raw);
            if (!parsed ||
                typeof parsed !== 'object' ||
                parsed.version !== STORE_SCHEMA_VERSION ||
                !parsed.items ||
                typeof parsed.items !== 'object' ||
                Array.isArray(parsed.items)) {
                throw new Error(`Unsupported store payload shape or version in ${this.filePath}`);
            }
            for (const [key, value] of Object.entries(parsed.items)) {
                this.store.set(key, value);
            }
        }
        catch (error) {
            this.quarantineCorruptedFile(error);
        }
    }
    flush() {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        const payload = {
            version: STORE_SCHEMA_VERSION,
            items: Object.fromEntries(this.store.entries()),
        };
        const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf8');
        fs.renameSync(tempPath, this.filePath);
    }
    quarantineCorruptedFile(error) {
        const quarantinePath = `${this.filePath}.corrupt-${Date.now()}`;
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        fs.renameSync(this.filePath, quarantinePath);
        console.warn(`[Persistence] Quarantined corrupted store ${this.filePath} -> ${quarantinePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
}
class SqliteKeyValueStore {
    name;
    sqlitePath;
    dir;
    database;
    constructor(name, sqlitePath, dir) {
        this.name = name;
        this.sqlitePath = sqlitePath;
        this.dir = dir;
        this.database = createSqliteDatabase({
            dir: this.dir,
            sqlitePath: this.sqlitePath,
        });
        applySqliteMigrations(this.database, 'key_value_store', keyValueStoreMigrations);
    }
    get(key) {
        const row = this.database
            .prepare('SELECT value_json FROM key_value_store WHERE namespace = ? AND item_key = ?')
            .get(this.name, key);
        return this.parseRowValue(key, row?.value_json);
    }
    has(key) {
        const row = this.database
            .prepare('SELECT COUNT(*) as count FROM key_value_store WHERE namespace = ? AND item_key = ?')
            .get(this.name, key);
        const count = typeof row.count === 'bigint' ? Number(row.count) : row.count;
        return count > 0;
    }
    set(key, value) {
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
    delete(key) {
        const result = this.database
            .prepare('DELETE FROM key_value_store WHERE namespace = ? AND item_key = ?')
            .run(this.name, key);
        return Number(result.changes ?? 0) > 0;
    }
    values() {
        const rows = this.database
            .prepare('SELECT item_key, value_json FROM key_value_store WHERE namespace = ? ORDER BY item_key')
            .all(this.name);
        return rows
            .map((row) => this.parseRowValue(row.item_key, row.value_json))
            .filter((value) => value !== undefined);
    }
    entries() {
        const rows = this.database
            .prepare('SELECT item_key, value_json FROM key_value_store WHERE namespace = ? ORDER BY item_key')
            .all(this.name);
        return rows.flatMap((row) => {
            const value = this.parseRowValue(row.item_key, row.value_json);
            return value === undefined ? [] : [[row.item_key, value]];
        });
    }
    clear() {
        this.database.prepare('DELETE FROM key_value_store WHERE namespace = ?').run(this.name);
    }
    size() {
        const row = this.database
            .prepare('SELECT COUNT(*) as count FROM key_value_store WHERE namespace = ?')
            .get(this.name);
        return typeof row.count === 'bigint' ? Number(row.count) : row.count;
    }
    parseRowValue(key, rawValue) {
        if (rawValue === undefined) {
            return undefined;
        }
        try {
            return JSON.parse(rawValue);
        }
        catch (error) {
            console.warn(`[Persistence] Ignoring invalid JSON payload in sqlite store "${this.name}" for key "${key}": ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }
}
export function createKeyValueStore(name, options = {}) {
    const backend = options.backend ?? PERSISTENCE_CONFIG.experimentalStoreBackend;
    const dir = options.dir ?? PERSISTENCE_CONFIG.experimentalStoreDir ?? undefined;
    const sqlitePath = options.sqlitePath ?? PERSISTENCE_CONFIG.experimentalSqlitePath ?? undefined;
    if (backend === 'file') {
        return new JsonFileKeyValueStore(name, dir);
    }
    if (backend === 'sqlite') {
        return new SqliteKeyValueStore(name, sqlitePath, dir);
    }
    return new InMemoryKeyValueStore();
}
