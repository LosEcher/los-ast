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
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    vi.resetModules();
  });

  describe('Defaults & shape', () => {
    it('should apply default values when env is not provided', async () => {
      delete process.env.NODE_ENV;
      const {
        NODE_ENV,
        PORT,
        SCAN_LIMITS,
        ROUTE_CONFIG,
        validateConfig,
      } = await import('../../../src/config/index.js');

      expect(NODE_ENV).toBe('development');
      expect(PORT).toBe(3000);
      expect(SCAN_LIMITS.maxFilesPerSyncScan).toBe(1000);
      expect(SCAN_LIMITS.maxResponseBytes).toBe(10485760);
      expect(SCAN_LIMITS.maxDurationMs).toBe(30000);
      expect(ROUTE_CONFIG.enableExperimental).toBe(false);
      expect(ROUTE_CONFIG.prefixes.experimental).toBe('/experimental');

      const validation = validateConfig();
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should expose route prefix defaults through env override fields', async () => {
      process.env.ROUTE_PREFIX_EXPERIMENTAL = '/exp';
      process.env.ROUTE_PREFIX_INTERNAL = '/priv';
      process.env.ROUTE_PREFIX_VPS_AGENT_WEB = '/vps';
      vi.resetModules();

      const { ROUTE_CONFIG } = await import('../../../src/config/index.js');

      expect(ROUTE_CONFIG.prefixes.experimental).toBe('/exp');
      expect(ROUTE_CONFIG.prefixes.internal).toBe('/priv');
      expect(ROUTE_CONFIG.prefixes.vpsAgentWeb).toBe('/vps');
    });
  });

  describe('Environment schema validation', () => {
    it('should validate NODE_ENV against allowed values', async () => {
      for (const env of ['development', 'production', 'test']) {
        process.env.NODE_ENV = env;
        vi.resetModules();

        const { NODE_ENV } = await import('../../../src/config/index.js');
        expect(NODE_ENV).toBe(env);
      }
    });

    it('should reject invalid NODE_ENV', async () => {
      process.env.NODE_ENV = 'invalid-env';
      vi.resetModules();

      const { validateConfig } = await import('../../../src/config/index.js');
      const result = validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid NODE_ENV'))).toBe(true);
    });
  });

  describe('Numeric validation', () => {
    it('should validate PORT range', async () => {
      process.env.PORT = '70000';
      vi.resetModules();

      const { PORT, validateConfig } = await import('../../../src/config/index.js');
      expect(PORT).toBe(3000);
      expect(validateConfig().errors.some((e) => e.includes('Invalid PORT'))).toBe(true);
    });

    it('should validate scan limits are in valid range', async () => {
      process.env.MAX_FILES_PER_SYNC_SCAN = '0';
      process.env.MAX_RESPONSE_BYTES = '100';
      process.env.MAX_SCAN_DURATION_MS = '500';
      vi.resetModules();

      const { validateConfig } = await import('../../../src/config/index.js');
      const result = validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('MAX_FILES_PER_SYNC_SCAN'))).toBe(true);
      expect(result.errors.some((e) => e.includes('MAX_RESPONSE_BYTES'))).toBe(true);
      expect(result.errors.some((e) => e.includes('MAX_SCAN_DURATION_MS'))).toBe(true);
    });

    it('should reject non-numeric scan limit', async () => {
      process.env.MAX_SCAN_DURATION_MS = 'abc';
      vi.resetModules();

      const { validateConfig } = await import('../../../src/config/index.js');
      const result = validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('MAX_SCAN_DURATION_MS'))).toBe(true);
    });
  });

  describe('Boolean validation', () => {
    it('should parse boolean env as expected', async () => {
      process.env.ENABLE_EXPERIMENTAL_ROUTES = 'true';
      process.env.ENABLE_INTERNAL_ROUTES = 'false';
      process.env.DEV_ALLOW_UNVERIFIED_IDENTITY = '1';
      vi.resetModules();

      const { ROUTE_CONFIG, DEV_ALLOW_UNVERIFIED_IDENTITY } = await import('../../../src/config/index.js');

      expect(ROUTE_CONFIG.enableExperimental).toBe(true);
      expect(ROUTE_CONFIG.enableInternal).toBe(false);
      expect(DEV_ALLOW_UNVERIFIED_IDENTITY).toBe(true);
    });

    it('should reject invalid boolean value', async () => {
      process.env.ENABLE_VPS_AGENT_WEB_ROUTES = 'not-a-boolean';
      vi.resetModules();

      const { validateConfig } = await import('../../../src/config/index.js');
      const result = validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid ENABLE_VPS_AGENT_WEB_ROUTES'))).toBe(true);
    });
  });

  describe('Route prefix validation', () => {
    it('should reject invalid route prefix', async () => {
      process.env.ROUTE_PREFIX_EXPERIMENTAL = 'experimental';
      vi.resetModules();

      const { validateConfig } = await import('../../../src/config/index.js');
      const result = validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('ROUTE_PREFIX_EXPERIMENTAL'))).toBe(true);
      expect(result.errors.some((e) => e.includes('start with'))).toBe(true);
    });
  });

  describe('Internal route validation', () => {
    it('should require access control in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ENABLE_INTERNAL_ROUTES = 'true';
      vi.resetModules();

      const { validateConfig } = await import('../../../src/config/index.js');
      const result = validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Production safety: INTERNAL_ROUTES_ENABLED'))).toBe(true);
    });

    it('should validate ip format and token length for internal routes', async () => {
      process.env.ENABLE_INTERNAL_ROUTES = 'true';
      process.env.INTERNAL_ROUTES_ALLOWED_IPS = '192.168.1.1,not-an-ip';
      process.env.INTERNAL_ROUTES_TOKEN = 'short-token';
      vi.resetModules();

      const { validateConfig } = await import('../../../src/config/index.js');
      const result = validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid IP address in INTERNAL_ROUTES_ALLOWED_IPS'))).toBe(true);
      expect(result.errors.some((e) => e.includes('INTERNAL_ROUTES_TOKEN should be at least 32 characters'))).toBe(true);
    });

    it('should pass when token has enough length', async () => {
      process.env.ENABLE_INTERNAL_ROUTES = 'true';
      process.env.INTERNAL_ROUTES_TOKEN = 'x'.repeat(32);
      vi.resetModules();

      const { validateConfig } = await import('../../../src/config/index.js');
      const result = validateConfig();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Identity validation', () => {
    it('should require jwt secrets when JWT is enforced', async () => {
      process.env.ENABLE_EXPERIMENTAL_ROUTES = 'true';
      process.env.ENFORCE_JWT = 'true';
      process.env.JWT_SECRET = '';
      process.env.LSCLAW_JWT_SECRET = '';
      vi.resetModules();

      const { validateConfig } = await import('../../../src/config/index.js');
      const result = validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid JWT secret'))).toBe(true);
    });

    it('should require JWT secret when running in production', async () => {
      process.env.NODE_ENV = 'production';
      vi.resetModules();

      const { validateConfig } = await import('../../../src/config/index.js');
      const result = validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid JWT secret'))).toBe(true);
    });
  });
});
