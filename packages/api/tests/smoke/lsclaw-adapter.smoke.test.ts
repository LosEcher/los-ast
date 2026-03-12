import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac } from 'node:crypto';
import errorHandlerPlugin from '../../src/plugins/error-handler';
import requestIdPlugin from '../../src/plugins/request-id';
import scopeValidatorPlugin from '../../src/plugins/scope-validator';
import cancellationPlugin from '../../src/plugins/cancellation';
import healthCheckPlugin from '../../src/plugins/health-check';
import identityPlugin from '../../src/plugins/identity';
import { scanRoutes, discoverRoutes } from '../../src/routes/core';
import vpsAgentWebRoutes from '../../src/routes/vps-agent-web/index';

const __dirname = dirname(fileURLToPath(import.meta.url));
const lsclawFixtureRoot = resolve(__dirname, '../../../../fixtures/golden/lsclaw-sample');
const { JWT_SECRET } = vi.hoisted(() => ({
  JWT_SECRET: 'test-smoke-jwt-secret',
}));

vi.mock('../../src/config/index.js', async () => {
  const actual = await vi.importActual('../../src/config/index.js');
  return {
    ...actual,
    SCOPE_CONFIG: {
      requireFullScope: false,
      allowedModes: {
        production: ['service'],
        development: ['local', 'service'],
      },
    },
    JWT_CONFIG: {
      secret: JWT_SECRET,
      enforceJWT: true,
    },
    DEV_ALLOW_UNVERIFIED_IDENTITY: false,
    IS_PRODUCTION: true,
  };
});

function createJwt(payloadData: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(payloadData)).toString('base64url');
  const signature = createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

describe('lsclaw Adapter Smoke Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(requestIdPlugin);
    await app.register(errorHandlerPlugin);
    await app.register(healthCheckPlugin);
    await app.register(cancellationPlugin);
    await app.register(scopeValidatorPlugin);
    await app.register(identityPlugin);
    await app.register(scanRoutes, { prefix: '/scan' });
    await app.register(discoverRoutes, { prefix: '/discover' });
    await app.register(vpsAgentWebRoutes, { prefix: '/vps-agent-web' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /healthz/live should report live', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/healthz/live',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('alive');
  });

  it('GET /healthz/ready should report ready', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/healthz/ready',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ready');
  });

  it('POST /scan should scan lsclaw fixture successfully', async () => {
    const jwt = createJwt({
      sub: 'smoke-runner',
      tenant_id: 'tenant-smoke',
      project_id: 'lsclaw-smoke',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/scan',
      headers: {
        authorization: `Bearer ${jwt}`,
        'x-request-id': `smoke-scan-${Date.now()}`,
      },
      payload: {
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

  it('POST /discover/symbols should return lsclaw fixture symbols', async () => {
    const jwt = createJwt({
      sub: 'smoke-runner',
      tenant_id: 'tenant-smoke',
      project_id: 'lsclaw-smoke',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/discover/symbols',
      headers: {
        authorization: `Bearer ${jwt}`,
        'x-request-id': `smoke-discover-${Date.now()}`,
      },
      payload: {
        rootDir: lsclawFixtureRoot,
        include: ['src/**/*.{ts,js,mjs}'],
        limit: 50,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data.symbols)).toBe(true);
    expect(body.data.symbols.length).toBeGreaterThan(0);
    expect(body.data.total).toBeGreaterThan(0);
    expect(typeof body.data.truncated).toBe('boolean');
  });

  it('POST /vps-agent-web/attribution/analyze should return analysis payload', async () => {
    const jwt = createJwt({
      sub: 'smoke-runner',
      tenant_id: 'tenant-smoke',
      project_id: 'lsclaw-smoke',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/vps-agent-web/attribution/analyze',
      headers: {
        authorization: `Bearer ${jwt}`,
        'x-request-id': `smoke-attribution-${Date.now()}`,
      },
      payload: {
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
