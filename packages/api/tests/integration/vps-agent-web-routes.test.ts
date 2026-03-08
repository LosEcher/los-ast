import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import errorHandlerPlugin from '../../src/plugins/error-handler';
import requestIdPlugin from '../../src/plugins/request-id';
import scopeValidatorPlugin from '../../src/plugins/scope-validator';
import healthCheckPlugin from '../../src/plugins/health-check';
import vpsAgentWebRoutes from '../../src/routes/vps-agent-web/index';

describe('VPS Agent Web Routes', () => {
  it('should return 404 when routes are not registered', async () => {
    const app = Fastify({ logger: false });
    await app.register(requestIdPlugin);
    await app.register(errorHandlerPlugin);
    await app.register(healthCheckPlugin);
    await app.register(scopeValidatorPlugin);
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/vps-agent-web/approvals/stats?scope=%7B%22tenant_id%22%3A%22t1%22%2C%22project_id%22%3A%22p1%22%7D',
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  describe('registered routes', () => {
    let app: FastifyInstance;
    const scope = { tenant_id: 'tenant-vps', project_id: 'project-vps' };

    beforeAll(async () => {
      app = Fastify({ logger: false });
      await app.register(requestIdPlugin);
      await app.register(errorHandlerPlugin);
      await app.register(healthCheckPlugin);
      await app.register(scopeValidatorPlugin);
      await app.register(vpsAgentWebRoutes, { prefix: '/vps-agent-web' });
      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    it('should expose approval stats endpoint', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/vps-agent-web/approvals/stats?scope=${encodeURIComponent(JSON.stringify(scope))}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.stats).toBeDefined();
    });

    it('should expose incident stats endpoint', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/vps-agent-web/incidents/stats/store?scope=${encodeURIComponent(JSON.stringify(scope))}`,
      });

      expect(response.statusCode).toBe(200);
    });

    it('should enforce scope validation on attribution endpoint', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/vps-agent-web/attribution/analyze',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('MISSING_SCOPE');
    });
  });
});
