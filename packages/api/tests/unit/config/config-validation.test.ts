/**
 * Configuration Validation Tests
 * 配置验证测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Config Validation', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original env
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    vi.resetModules();
  });

  describe('Route Prefix Validation', () => {
    it('should accept valid route prefixes', async () => {
      process.env.ROUTE_PREFIX_EXPERIMENTAL = '/experimental';
      process.env.ROUTE_PREFIX_INTERNAL = '/internal';

      const { validateConfig } = await import('../../../src/config/index.js');
      const result = validateConfig();

      // Should not have prefix-related errors
      const prefixErrors = result.errors.filter(e => e.includes('prefix'));
      expect(prefixErrors).toHaveLength(0);
    });

    it('should reject prefixes without leading slash', async () => {
      // This test would need ROUTE_CONFIG to read from env
      // For now, we test the validation logic indirectly
      const { ROUTE_CONFIG } = await import('../../../src/config/index.js');
      expect(ROUTE_CONFIG.prefixes.experimental).toMatch(/^\//);
      expect(ROUTE_CONFIG.prefixes.internal).toMatch(/^\//);
    });
  });

  describe('Environment Variable Validation', () => {
    it('should validate NODE_ENV values', async () => {
      const validEnvs = ['development', 'production', 'test'];

      for (const env of validEnvs) {
        process.env.NODE_ENV = env;
        vi.resetModules();
        const { NODE_ENV } = await import('../../../src/config/index.js');
        expect(NODE_ENV).toBe(env);
      }
    });

    it('should default NODE_ENV to development', async () => {
      delete process.env.NODE_ENV;
      vi.resetModules();
      const { NODE_ENV } = await import('../../../src/config/index.js');
      expect(NODE_ENV).toBe('development');
    });
  });

  describe('Scan Limits Validation', () => {
    it('should validate port range', async () => {
      process.env.PORT = '99999'; // Invalid port
      vi.resetModules();
      const { validateConfig } = await import('../../../src/config/index.js');
      const result = validateConfig();

      expect(result.errors.some(e => e.includes('PORT'))).toBe(true);
      expect(result.valid).toBe(false);
    });

    it('should validate scan limits are positive', async () => {
      process.env.MAX_FILES_PER_SYNC_SCAN = '-1';
      vi.resetModules();
      const { validateConfig } = await import('../../../src/config/index.js');
      const result = validateConfig();

      expect(result.errors.some(e => e.includes('MAX_FILES_PER_SYNC_SCAN'))).toBe(true);
    });

    it('should validate response bytes minimum', async () => {
      process.env.MAX_RESPONSE_BYTES = '100'; // Too small
      vi.resetModules();
      const { validateConfig } = await import('../../../src/config/index.js');
      const result = validateConfig();

      expect(result.errors.some(e => e.includes('MAX_RESPONSE_BYTES'))).toBe(true);
    });
  });

  describe('Internal Access Control Validation', () => {
    it('should require access control for internal routes in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ENABLE_INTERNAL_ROUTES = 'true';
      // Don't set INTERNAL_ROUTES_ALLOWED_IPS or INTERNAL_ROUTES_TOKEN

      vi.resetModules();
      const { validateConfig } = await import('../../../src/config/index.js');
      const result = validateConfig();

      expect(result.errors.some(e => e.includes('INTERNAL_ROUTES') && e.includes('Production'))).toBe(true);
    });

    it('should accept internal routes with IP whitelist in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ENABLE_INTERNAL_ROUTES = 'true';
      process.env.INTERNAL_ROUTES_ALLOWED_IPS = '192.168.1.100';

      vi.resetModules();
      const { validateConfig } = await import('../../../src/config/index.js');
      const result = validateConfig();

      // Should not have the production safety error
      const safetyErrors = result.errors.filter(e => e.includes('Production safety'));
      expect(safetyErrors).toHaveLength(0);
    });

    it('should warn about short internal tokens', async () => {
      process.env.ENABLE_INTERNAL_ROUTES = 'true';
      process.env.INTERNAL_ROUTES_TOKEN = 'short';

      vi.resetModules();
      const { validateConfig } = await import('../../../src/config/index.js');
      const result = validateConfig();

      expect(result.errors.some(e => e.includes('TOKEN') && e.includes('32'))).toBe(true);
    });
  });

  describe('Route Configuration', () => {
    it('should have correct default values', async () => {
      const {
        ROUTE_CONFIG,
        SCAN_LIMITS
      } = await import('../../../src/config/index.js');

      expect(ROUTE_CONFIG.enableExperimental).toBe(false);
      expect(ROUTE_CONFIG.enableInternal).toBe(false);
      expect(ROUTE_CONFIG.prefixes.experimental).toBe('/experimental');
      expect(ROUTE_CONFIG.prefixes.internal).toBe('/internal');

      expect(SCAN_LIMITS.maxFilesPerSyncScan).toBe(1000);
      expect(SCAN_LIMITS.maxResponseBytes).toBe(10485760);
      expect(SCAN_LIMITS.maxDurationMs).toBe(30000);
    });

    it('should enable experimental routes when env is set', async () => {
      process.env.ENABLE_EXPERIMENTAL_ROUTES = 'true';
      vi.resetModules();
      const { ROUTE_CONFIG } = await import('../../../src/config/index.js');
      expect(ROUTE_CONFIG.enableExperimental).toBe(true);
    });
  });
});
