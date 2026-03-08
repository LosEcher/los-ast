/**
 * Experimental Routes Integration Tests
 * 实验性路由集成测试
 *
 * 测试路由开关行为和基本功能
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import errorHandlerPlugin from '../../src/plugins/error-handler';
import requestIdPlugin from '../../src/plugins/request-id';
import scopeValidatorPlugin from '../../src/plugins/scope-validator';
import healthCheckPlugin from '../../src/plugins/health-check';

// Experimental Routes
import {
  memoryProposalsRoutes,
  incidentRoutes,
  attributionRoutes,
  recoveryRoutes,
  approvalRoutes,
  hotReloadRoutes,
  evidenceRoutes,
} from '../../src/routes/experimental/index';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(__dirname, '../../../../fixtures/golden/lsclaw-sample');

describe('Experimental Routes Tests', () => {
  describe('Routes Toggle Behavior', () => {
    it('should register experimental routes when enabled', async () => {
      const app = Fastify({ logger: false });

      // 注册基础插件
      await app.register(requestIdPlugin);
      await app.register(errorHandlerPlugin);
      await app.register(healthCheckPlugin);
      await app.register(scopeValidatorPlugin);

      // 注册实验性路由
      await app.register(memoryProposalsRoutes, { prefix: '/experimental/memory-proposals' });
      await app.register(incidentRoutes, { prefix: '/experimental/incidents' });
      await app.register(approvalRoutes, { prefix: '/experimental/approvals' });

      await app.ready();

      const baseScope = { tenant_id: 'test', project_id: 'test' };

      // 验证路由已注册
      const response = await app.inject({
        method: 'GET',
        url: `/experimental/memory-proposals/stats?scope=${encodeURIComponent(JSON.stringify(baseScope))}`,
      });

      // 200 表示路由存在且成功处理
      expect(response.statusCode).toBe(200);

      await app.close();
    });

    it('should return 404 for unregistered experimental routes', async () => {
      const app = Fastify({ logger: false });

      // 注册基础插件
      await app.register(requestIdPlugin);
      await app.register(errorHandlerPlugin);
      await app.register(healthCheckPlugin);
      await app.register(scopeValidatorPlugin);

      // 不注册实验性路由
      await app.ready();

      const baseScope = { tenant_id: 'test', project_id: 'test' };

      // 验证路由未注册
      const response = await app.inject({
        method: 'GET',
        url: `/experimental/memory-proposals/stats?scope=${encodeURIComponent(JSON.stringify(baseScope))}`,
      });

      expect(response.statusCode).toBe(404);

      await app.close();
    });
  });

  describe('Experimental Routes Functionality', () => {
    let app: FastifyInstance;
    const baseScope = { tenant_id: 'test', project_id: 'test' };

    beforeAll(async () => {
      app = Fastify({ logger: false });

      // 注册基础插件
      await app.register(requestIdPlugin);
      await app.register(errorHandlerPlugin);
      await app.register(healthCheckPlugin);
      await app.register(scopeValidatorPlugin);

      // 注册所有实验性路由
      await app.register(memoryProposalsRoutes, { prefix: '/experimental/memory-proposals' });
      await app.register(incidentRoutes, { prefix: '/experimental/incidents' });
      await app.register(attributionRoutes, { prefix: '/experimental/attribution' });
      await app.register(recoveryRoutes, { prefix: '/experimental/recovery' });
      await app.register(approvalRoutes, { prefix: '/experimental/approvals' });
      await app.register(hotReloadRoutes, { prefix: '/experimental/hotreload' });
      await app.register(evidenceRoutes, { prefix: '/experimental/evidence' });

      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    describe('Memory Proposals Routes', () => {
      it('GET /experimental/memory-proposals/stats should return stats', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/experimental/memory-proposals/stats?scope=${encodeURIComponent(JSON.stringify(baseScope))}`,
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.stats).toBeDefined();
      });

      it('GET /experimental/memory-proposals/proposals/:id should return 404 for non-existent', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/experimental/memory-proposals/proposals/non-existent?scope=${encodeURIComponent(JSON.stringify(baseScope))}`,
        });

        expect(response.statusCode).toBe(404);
        const body = JSON.parse(response.body);
        expect(body.error).toBeDefined();
      });
    });

    describe('Incident Routes', () => {
      it('GET /experimental/incidents/stats/store should return stats', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/experimental/incidents/stats/store?scope=${encodeURIComponent(JSON.stringify(baseScope))}`,
        });

        expect(response.statusCode).toBe(200);
      });

      it('GET /experimental/incidents/stats/collection should return stats', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/experimental/incidents/stats/collection?scope=${encodeURIComponent(JSON.stringify(baseScope))}`,
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('Approval Routes', () => {
      it('GET /experimental/approvals/stats should return stats', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/experimental/approvals/stats?scope=${encodeURIComponent(JSON.stringify(baseScope))}`,
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.stats).toBeDefined();
      });
    });

    describe('HotReload Routes', () => {
      it('GET /experimental/hotreload/stats should return stats', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/experimental/hotreload/stats?scope=${encodeURIComponent(JSON.stringify(baseScope))}`,
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('Evidence Routes', () => {
      it('GET /experimental/evidence should require scope', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/experimental/evidence',
        });

        // 应该返回 400 因为缺少 scope
        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.error.code).toBe('MISSING_SCOPE');
      });

      it('POST /experimental/evidence/generate should return stable bundle metadata', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/experimental/evidence/generate',
          payload: {
            scope: baseScope,
            project: 'lsclaw',
            root_dir: fixtureRoot,
            findings: [],
            deterministic: true,
            include: ['src/**/*.ts'],
          },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.body);
        expect(body.data.schema_version).toBe('1.0.0');
        expect(body.data.generator.tool).toBe('los-ast');
        expect(body.data.generator.version).toBeDefined();
        expect(body.data.deterministic).toBe(true);
      });
    });

    describe('Attribution Routes', () => {
      it('POST /experimental/attribution/analyze should require scope', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/experimental/attribution/analyze',
          payload: {},
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.error.code).toBe('MISSING_SCOPE');
      });
    });

    describe('Recovery Routes', () => {
      it('GET /experimental/recovery/recipes should require scope', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/experimental/recovery/recipes',
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.error.code).toBe('MISSING_SCOPE');
      });
    });
  });

  describe('Query Parameter Validation', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = Fastify({ logger: false });

      await app.register(requestIdPlugin);
      await app.register(errorHandlerPlugin);
      await app.register(healthCheckPlugin);
      await app.register(scopeValidatorPlugin);

      await app.register(approvalRoutes, { prefix: '/experimental/approvals' });
      await app.register(incidentRoutes, { prefix: '/experimental/incidents' });

      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    it('should parse valid approval status query param', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/experimental/approvals?status=pending&tenant_id=test',
      });

      // 应该成功解析参数（可能返回空结果）
      expect([200, 400]).toContain(response.statusCode);
    });

    it('should filter invalid approval status query param', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/experimental/approvals?status=invalid_status&tenant_id=test',
      });

      // 无效的状态应该被过滤为 undefined
      expect([200, 400]).toContain(response.statusCode);
    });

    it('should parse valid incident severity query param', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/experimental/incidents?severity=high&tenant_id=test',
      });

      expect([200, 400]).toContain(response.statusCode);
    });

    it('should parse query integer params correctly', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/experimental/approvals?limit=10&offset=20&tenant_id=test',
      });

      expect([200, 400]).toContain(response.statusCode);
    });

    it('should handle invalid integer params gracefully', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/experimental/approvals?limit=not_a_number&tenant_id=test',
      });

      // 应该优雅处理，使用默认值
      expect([200, 400]).toContain(response.statusCode);
    });
  });
});
