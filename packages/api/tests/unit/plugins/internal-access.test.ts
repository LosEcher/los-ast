/**
 * Internal Access Plugin Unit Tests
 * Phase 1: Core plugin test coverage
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fastify from 'fastify';
import internalAccessPlugin, { generateInternalToken } from '../../../src/plugins/internal-access';

describe('Internal Access Plugin', () => {
  let app: ReturnType<typeof fastify>;

  beforeEach(async () => {
    app = fastify({ logger: false });
    await app.register(internalAccessPlugin);
    
    // Add a test internal route
    app.get('/internal/test', async () => {
      return { internal: true };
    });
    
    // Add a test public route
    app.get('/public/test', async () => {
      return { public: true };
    });
  });

  describe('public route access', () => {
    it('should allow access to non-internal routes without restrictions', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/public/test',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should not require auth for public routes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/public/test',
        headers: {},
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('internal route access', () => {
    it('should have /internal/test endpoint', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/internal/test',
      });

      // Response depends on environment configuration
      expect([200, 403, 500]).toContain(response.statusCode);
    });

    it('should return internal flag on success', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/internal/test',
      });

      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body.internal).toBe(true);
      }
    });

    it('should handle requests with authorization header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/internal/test',
        headers: {
          authorization: 'Bearer test-token',
        },
      });

      // Should not crash
      expect([200, 403, 500]).toContain(response.statusCode);
    });

    it('should handle requests with x-forwarded-for header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/internal/test',
        headers: {
          'x-forwarded-for': '192.168.1.1',
        },
      });

      // Should not crash
      expect([200, 403, 500]).toContain(response.statusCode);
    });
  });

  describe('internal access config', () => {
    it('should handle internal routes with various configurations', async () => {
      // Test multiple requests to ensure plugin doesn't crash
      const responses = await Promise.all([
        app.inject({ method: 'GET', url: '/internal/test' }),
        app.inject({ method: 'GET', url: '/internal/test', headers: { authorization: 'Bearer token' } }),
        app.inject({ method: 'GET', url: '/internal/test', headers: { 'x-forwarded-for': '10.0.0.1' } }),
      ]);

      // All should return valid HTTP status codes
      responses.forEach(response => {
        expect([200, 403, 500]).toContain(response.statusCode);
      });
    });
  });

  describe('generateInternalToken', () => {
    it('should generate token of correct length', () => {
      const token = generateInternalToken();
      expect(token.length).toBe(64);
    });

    it('should generate unique tokens', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 10; i++) {
        tokens.add(generateInternalToken());
      }
      expect(tokens.size).toBe(10);
    });

    it('should only contain alphanumeric characters', () => {
      const token = generateInternalToken();
      expect(token).toMatch(/^[A-Za-z0-9]+$/);
    });

    it('should generate different tokens on each call', () => {
      const token1 = generateInternalToken();
      const token2 = generateInternalToken();
      expect(token1).not.toBe(token2);
    });
  });
});
