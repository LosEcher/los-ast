import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import errorHandlerPlugin from '../../src/plugins/error-handler';
import requestIdPlugin from '../../src/plugins/request-id';
import scopeValidatorPlugin from '../../src/plugins/scope-validator';
import cancellationPlugin from '../../src/plugins/cancellation';
import healthCheckPlugin from '../../src/plugins/health-check';
import { scanRoutes, discoverRoutes } from '../../src/routes/core';
import vpsAgentWebRoutes from '../../src/routes/vps-agent-web/index';

const __dirname = dirname(fileURLToPath(import.meta.url));
const lsclawFixtureRoot = resolve(__dirname, '../../../../fixtures/golden/lsclaw-sample');

describe('lsclaw Adapter Smoke Tests', () => {
  let app: FastifyInstance;
  const scope = {
    tenant_id: 'tenant-smoke',
    project_id: 'lsclaw-smoke',
    actor_id: 'smoke-runner',
    mode: 'service',
  };

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(requestIdPlugin);
    await app.register(errorHandlerPlugin);
    await app.register(healthCheckPlugin);
    await app.register(cancellationPlugin);
    await app.register(scopeValidatorPlugin);
    await app.register(scanRoutes, { prefix: '/scan' });
    await app.register(discoverRoutes, { prefix: '/discover' });
    await app.register(vpsAgentWebRoutes, { prefix: '/vps-agent-web' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /scan should scan lsclaw fixture successfully', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/scan',
      payload: {
        scope,
        project: 'lsclaw',
        rootDir: lsclawFixtureRoot,
        include: ['src/**/*.{ts,js,mjs}'],
        includeStats: true,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data.findings)).toBe(true);
    expect(body.data.filesScanned).toBeGreaterThan(0);
  });

  it('POST /vps-agent-web/attribution/analyze should return analysis payload', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/vps-agent-web/attribution/analyze',
      payload: {
        scope,
        incident_id: 'inc-smoke-001',
        evidence_bundle_id: 'evd-smoke-001',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.analysis).toBeDefined();
    expect(body.analysis.provider_used).toBe('lsclaw');
    expect(Array.isArray(body.analysis.hypotheses)).toBe(true);
  });
});
