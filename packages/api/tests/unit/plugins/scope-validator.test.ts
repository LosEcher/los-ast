/**
 * Scope Validator Plugin Unit Tests
 * 硬约束 #3: Scope 验证测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fastify from 'fastify';
import scopeValidatorPlugin from '../../../src/plugins/scope-validator';
import { ScopeError } from '../../../src/types/errors';

describe('Scope Validator Plugin', () => {
  let app: ReturnType<typeof fastify>;

  beforeEach(async () => {
    app = fastify();
    await app.register(scopeValidatorPlugin);

    // 添加测试路由
    app.post('/test', async () => ({ success: true }));
  });

  describe('health check bypass', () => {
    it('should bypass scope validation for /healthz routes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/healthz/live',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('missing scope', () => {
    it('should reject request without scope', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/test',
        payload: { project: 'test' },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('MISSING_SCOPE');
    });
  });

  describe('production scope validation', () => {
    // 注意：这些测试在开发环境下行为不同
    // 需要通过设置环境变量或 mock 来测试生产行为

    it('should validate scope structure', async () => {
      // 此测试假设生产环境配置
      // 实际行为取决于 SCOPE_CONFIG.requireFullScope
      const response = await app.inject({
        method: 'POST',
        url: '/test',
        payload: {
          scope: {
            tenant_id: 'test-tenant',
            project_id: 'test-project',
            actor_id: 'test-actor',
          },
          project: 'test',
        },
      });

      // 在生产环境下应该通过，开发环境下也应该通过
      expect(response.statusCode).not.toBe(400);
    });
  });
});
