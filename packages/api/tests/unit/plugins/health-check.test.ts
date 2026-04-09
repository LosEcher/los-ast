/**
 * Health Check Plugin Unit Tests
 * Phase 1: Core plugin test coverage
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fastify from 'fastify';
import healthCheckPlugin from '../../../src/plugins/health-check';

describe('Health Check Plugin', () => {
  let app: ReturnType<typeof fastify>;

  beforeEach(async () => {
    app = fastify({ logger: false });
    await app.register(healthCheckPlugin);
  });

  describe('liveness probe', () => {
    it('should return 200 for /healthz/live', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/healthz/live',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return alive status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/healthz/live',
      });

      const body = JSON.parse(response.body);
      expect(body.status).toBe('alive');
    });

    it('should include timestamp', async () => {
      const beforeTime = Date.now();
      
      const response = await app.inject({
        method: 'GET',
        url: '/healthz/live',
      });

      const afterTime = Date.now();
      const body = JSON.parse(response.body);
      
      const timestampMs = new Date(body.timestamp).getTime();
      expect(timestampMs).toBeGreaterThanOrEqual(beforeTime);
      expect(timestampMs).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('readiness probe', () => {
    it('should have /healthz/ready endpoint', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/healthz/ready',
      });

      expect(response.statusCode).toBeDefined();
    });

    it('should return timestamp in response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/healthz/ready',
      });

      const body = JSON.parse(response.body);
      expect(body.timestamp).toBeDefined();
      expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    });
  });

  describe('health check response format', () => {
    it('should have consistent response structure for liveness', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/healthz/live',
      });

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('timestamp');
    });

    it('should have consistent response structure for readiness', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/healthz/ready',
      });

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('timestamp');
    });
  });
});
