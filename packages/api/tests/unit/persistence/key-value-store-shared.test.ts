import { describe, expect, it } from 'vitest';

import {
  STORE_SCHEMA_VERSION,
  buildQuarantineStorePath,
  buildSerializedStorePayload,
  buildTempStorePath,
  parseSerializedStore,
  parseStoredJsonValue,
  resolveJsonStoreFilePath,
  resolveKeyValueStoreOptions,
  sanitizeStoreName,
  toSqliteCount,
} from '../../../src/persistence/key-value-store/shared.js';

describe('key value store shared helpers', () => {
  it('normalizes file paths and payload envelopes conservatively', () => {
    expect(sanitizeStoreName('Approval Store/Prod')).toBe('Approval_Store_Prod');
    expect(resolveJsonStoreFilePath('Approval Store/Prod', '/tmp/state')).toBe('/tmp/state/Approval_Store_Prod.json');
    expect(buildTempStorePath('/tmp/state/store.json', 321, 456)).toBe('/tmp/state/store.json.321.456.tmp');
    expect(buildQuarantineStorePath('/tmp/state/store.json', 789)).toBe('/tmp/state/store.json.corrupt-789');

    expect(buildSerializedStorePayload([['a', { value: 1 }]])).toEqual({
      version: STORE_SCHEMA_VERSION,
      items: {
        a: { value: 1 },
      },
    });
  });

  it('parses stored payloads and sqlite values without changing error semantics', () => {
    expect(parseSerializedStore<{ value: string }>(
      JSON.stringify({ version: 1, items: { persisted: { value: 'saved' } } }),
      '/tmp/store.json'
    )).toEqual({
      persisted: { value: 'saved' },
    });

    expect(() => parseSerializedStore('{bad-json', '/tmp/store.json')).toThrow();
    expect(() => parseSerializedStore(JSON.stringify({ version: 999, items: {} }), '/tmp/store.json')).toThrow(
      'Unsupported store payload shape or version in /tmp/store.json'
    );

    expect(parseStoredJsonValue<{ value: string }>({ rawValue: '{"value":"saved"}' })).toEqual({
      value: 'saved',
    });
    const invalidPayloads: string[] = [];
    expect(parseStoredJsonValue({
      rawValue: '{bad-json',
      onInvalid: (error) => invalidPayloads.push(error instanceof Error ? error.message : String(error)),
    })).toBeUndefined();
    expect(invalidPayloads).toHaveLength(1);
    expect(toSqliteCount(3n)).toBe(3);
  });

  it('resolves runtime options with explicit overrides before config defaults', () => {
    expect(resolveKeyValueStoreOptions(
      {
        backend: 'sqlite',
        dir: '/tmp/custom',
      },
      {
        experimentalStoreBackend: 'file',
        experimentalStoreDir: '/tmp/default',
        experimentalSqlitePath: '/tmp/default.sqlite',
      }
    )).toEqual({
      backend: 'sqlite',
      dir: '/tmp/custom',
      sqlitePath: '/tmp/default.sqlite',
    });
  });
});
