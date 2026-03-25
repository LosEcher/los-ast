import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCAN_LIMITS,
  deriveRuntimeConfig,
  normalizeAndValidateConfig,
  resolveNodeEnv,
} from '../../../src/config/shared';

describe('config shared helpers', () => {
  it('normalizes node env values and falls back conservatively', () => {
    expect(resolveNodeEnv('production')).toBe('production');
    expect(resolveNodeEnv('test')).toBe('test');
    expect(resolveNodeEnv('weird' as never)).toBe('development');
    expect(resolveNodeEnv(undefined)).toBe('development');
  });

  it('normalizes env values and reports schema / jwt errors without losing defaults', () => {
    const result = normalizeAndValidateConfig({
      NODE_ENV: 'production',
      PORT: '70000',
      ENFORCE_JWT: 'true',
      JWT_SECRET: '',
      LSCLAW_JWT_SECRET: '',
    });

    expect(result.values.PORT).toBe(3000);
    expect(result.errors.some((item) => item.includes('Invalid PORT'))).toBe(true);
    expect(result.errors.some((item) => item.includes('Invalid JWT secret'))).toBe(true);
  });

  it('derives runtime config state from parsed values', () => {
    const parsed = normalizeAndValidateConfig({
      NODE_ENV: 'development',
      ENABLE_EXPERIMENTAL_ROUTES: 'true',
      ENABLE_OPENAPI_NATIVE_PARSER: 'false',
      ROUTE_PREFIX_EXPERIMENTAL: '/exp',
      MAX_FILES_PER_SYNC_SCAN: String(DEFAULT_SCAN_LIMITS.maxFilesPerSyncScan),
      MAX_RESPONSE_BYTES: String(DEFAULT_SCAN_LIMITS.maxResponseBytes),
      MAX_SCAN_DURATION_MS: String(DEFAULT_SCAN_LIMITS.maxDurationMs),
    });

    const runtime = deriveRuntimeConfig(parsed);
    expect(runtime.NODE_ENV).toBe('development');
    expect(runtime.IS_PRODUCTION).toBe(false);
    expect(runtime.ROUTE_CONFIG.enableExperimental).toBe(true);
    expect(runtime.ROUTE_CONFIG.prefixes.experimental).toBe('/exp');
    expect(runtime.PARSER_CONFIG.enableOpenApiNativeParser).toBe(false);
    expect(runtime.SCAN_LIMITS.maxFilesPerSyncScan).toBe(DEFAULT_SCAN_LIMITS.maxFilesPerSyncScan);
  });
});
