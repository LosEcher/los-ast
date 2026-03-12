import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { createKeyValueStore } from '../../../src/persistence/key-value-store.js';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const target = tempDirs.pop();
    if (target && fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
});

describe('key value store persistence', () => {
  it('should behave like an in-memory key value store by default', () => {
    const store = createKeyValueStore<{ value: string }>('test-memory-store', {
      backend: 'memory',
    });

    store.set('a', { value: 'first' });

    expect(store.has('a')).toBe(true);
    expect(store.get('a')).toEqual({ value: 'first' });
    expect(store.values()).toEqual([{ value: 'first' }]);
    expect(store.size()).toBe(1);

    store.clear();
    expect(store.size()).toBe(0);
  });

  it('should persist file-backed values across store instances', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'los-ast-store-'));
    tempDirs.push(dir);

    const writer = createKeyValueStore<{ value: string }>('test-file-store', {
      backend: 'file',
      dir,
    });
    writer.set('persisted', { value: 'saved' });

    const reader = createKeyValueStore<{ value: string }>('test-file-store', {
      backend: 'file',
      dir,
    });

    expect(reader.get('persisted')).toEqual({ value: 'saved' });
    expect(reader.size()).toBe(1);
  });

  it('should persist sqlite-backed values across store instances', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'los-ast-store-'));
    tempDirs.push(dir);
    const sqlitePath = path.join(dir, 'state.sqlite');

    const writer = createKeyValueStore<{ value: string }>('test-sqlite-store', {
      backend: 'sqlite',
      sqlitePath,
    });
    writer.set('persisted', { value: 'saved' });

    const reader = createKeyValueStore<{ value: string }>('test-sqlite-store', {
      backend: 'sqlite',
      sqlitePath,
    });

    expect(reader.get('persisted')).toEqual({ value: 'saved' });
    expect(reader.size()).toBe(1);
  });

  it('should isolate sqlite-backed values by namespace', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'los-ast-store-'));
    tempDirs.push(dir);
    const sqlitePath = path.join(dir, 'state.sqlite');

    const incidentStore = createKeyValueStore<{ value: string }>('incident-store', {
      backend: 'sqlite',
      sqlitePath,
    });
    const approvalStore = createKeyValueStore<{ value: string }>('approval-store', {
      backend: 'sqlite',
      sqlitePath,
    });

    incidentStore.set('shared-id', { value: 'incident' });
    approvalStore.set('shared-id', { value: 'approval' });

    expect(incidentStore.get('shared-id')).toEqual({ value: 'incident' });
    expect(approvalStore.get('shared-id')).toEqual({ value: 'approval' });
    expect(incidentStore.entries()).toEqual([['shared-id', { value: 'incident' }]]);
    expect(approvalStore.entries()).toEqual([['shared-id', { value: 'approval' }]]);
  });

  it('should register sqlite schema versions for the key value store', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'los-ast-store-'));
    tempDirs.push(dir);
    const sqlitePath = path.join(dir, 'state.sqlite');

    const store = createKeyValueStore<{ value: string }>('schema-version-store', {
      backend: 'sqlite',
      sqlitePath,
    });
    store.set('persisted', { value: 'saved' });

    const database = new DatabaseSync(sqlitePath);
    const row = database
      .prepare('SELECT version FROM schema_versions WHERE schema_name = ?')
      .get('key_value_store') as { version: number | bigint } | undefined;

    expect(row).toBeDefined();
    expect(Number(row?.version)).toBe(1);
  });

  it('should quarantine invalid file-backed payloads and continue with an empty store', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'los-ast-store-'));
    tempDirs.push(dir);

    const filePath = path.join(dir, 'test-corrupt-store.json');
    fs.writeFileSync(filePath, '{not-valid-json', 'utf8');

    const store = createKeyValueStore<{ value: string }>('test-corrupt-store', {
      backend: 'file',
      dir,
    });

    expect(store.size()).toBe(0);
    const quarantined = fs.readdirSync(dir).filter((entry) => entry.startsWith('test-corrupt-store.json.corrupt-'));
    expect(quarantined).toHaveLength(1);
  });

  it('should quarantine unsupported store schema versions', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'los-ast-store-'));
    tempDirs.push(dir);

    const filePath = path.join(dir, 'test-versioned-store.json');
    fs.writeFileSync(filePath, JSON.stringify({
      version: 999,
      items: {
        persisted: { value: 'stale' },
      },
    }), 'utf8');

    const store = createKeyValueStore<{ value: string }>('test-versioned-store', {
      backend: 'file',
      dir,
    });

    expect(store.size()).toBe(0);
    const quarantined = fs.readdirSync(dir).filter((entry) => entry.startsWith('test-versioned-store.json.corrupt-'));
    expect(quarantined).toHaveLength(1);
  });

  it('should flush file-backed writes through a temp file rename without leaving tmp files behind', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'los-ast-store-'));
    tempDirs.push(dir);

    const store = createKeyValueStore<{ value: string }>('test-atomic-store', {
      backend: 'file',
      dir,
    });
    store.set('persisted', { value: 'saved' });

    const files = fs.readdirSync(dir);
    expect(files).toContain('test-atomic-store.json');
    expect(files.some((entry) => entry.includes('.tmp'))).toBe(false);
  });
});
