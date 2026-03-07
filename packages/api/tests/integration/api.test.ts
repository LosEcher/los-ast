/**
 * API Integration Tests
 * API 端到端集成测试
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import errorHandlerPlugin from '../../src/plugins/error-handler';
import requestIdPlugin from '../../src/plugins/request-id';
import scopeValidatorPlugin from '../../src/plugins/scope-validator';
import cancellationPlugin from '../../src/plugins/cancellation';
import healthCheckPlugin from '../../src/plugins/health-check';
import { scanRoutes, discoverRoutes } from '../../src/routes/core';

describe('API Integration Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });

    // 注册插件（与 server.ts 相同顺序）
    await app.register(requestIdPlugin);
    await app.register(errorHandlerPlugin);
    await app.register(healthCheckPlugin);
    await app.register(cancellationPlugin);
    await app.register(scopeValidatorPlugin);

    // 注册路由
    await app.register(scanRoutes, { prefix: '/scan' });
    await app.register(discoverRoutes, { prefix: '/discover' });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health Endpoints', () => {
    it('GET /healthz/live should return 200 with status alive', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/healthz/live',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('alive');
      expect(body.timestamp).toBeDefined();
    });

    it('GET /healthz/ready should return 200 or 503', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/healthz/ready',
      });

      // 可能是 200 (ready) 或 503 (not ready)
      expect([200, 503]).toContain(response.statusCode);
      const body = JSON.parse(response.body);
      expect(body.status).toBeDefined();
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('Scan Endpoint', () => {
    it('POST /scan should return 400 without scope', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/scan',
        payload: {
          project: 'test',
          rootDir: '/test',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.category).toBe('VALIDATION');
      expect(body.error.code).toBe('MISSING_SCOPE');
    });

    it('POST /scan should return 400 with invalid project', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/scan',
        payload: {
          scope: {
            tenant_id: 'test',
            project_id: 'test',
            actor_id: 'test',
          },
          project: '',
          rootDir: '/test',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.category).toBe('VALIDATION');
    });

    it('POST /scan should include X-Request-ID header', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/scan',
        payload: {
          scope: {
            tenant_id: 'test',
            project_id: 'test',
            actor_id: 'test',
          },
          project: 'test',
          rootDir: '/test',
        },
      });

      // 无论成功失败，都应该有 request ID
      expect(response.headers['x-request-id']).toBeDefined();
    });
  });

  describe('Discover Symbols Endpoint', () => {
    it('POST /discover/symbols should return 400 without scope', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/discover/symbols',
        payload: {
          rootDir: '/test',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('MISSING_SCOPE');
    });

    it('POST /discover/symbols should return 400 with invalid limit', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/discover/symbols',
        payload: {
          scope: {
            tenant_id: 'test',
            project_id: 'test',
            actor_id: 'test',
          },
          rootDir: '/test',
          limit: 0,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.category).toBe('VALIDATION');
    });

    it('POST /discover/symbols should accept valid limit range', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/discover/symbols',
        payload: {
          scope: {
            tenant_id: 'test',
            project_id: 'test',
            actor_id: 'test',
          },
          rootDir: '/test',
          limit: 500,
        },
      });

      // 应该是 200 或错误（因为 /test 可能不存在），但不应该是 400 验证错误
      if (response.statusCode === 400) {
        const body = JSON.parse(response.body);
        expect(body.error.code).not.toBe('INVALID_LIMIT');
      }
    });
  });

  describe('Error Response Format', () => {
    it('should return unified error format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/scan',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);

      // 验证统一错误格式
      expect(body.error).toBeDefined();
      expect(body.error.category).toBeDefined();
      expect(body.error.code).toBeDefined();
      expect(body.error.message).toBeDefined();
      expect(body.error.requestId).toBeDefined();
      expect(body.error.timestamp).toBeDefined();
      expect(body.error.retryable).toBeDefined();
    });
  });
});
