import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { createHmac } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import errorHandlerPlugin from '../../src/plugins/error-handler';
import requestIdPlugin from '../../src/plugins/request-id';
import scopeValidatorPlugin from '../../src/plugins/scope-validator';
import identityPlugin from '../../src/plugins/identity';
import { approvalRoutes, evidenceRoutes } from '../../src/routes/experimental';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(__dirname, '../../../../fixtures/golden/lsclaw-sample');

const { JWT_SECRET } = vi.hoisted(() => ({
  JWT_SECRET: 'test-identity-gate-secret',
}));

vi.mock('../../src/config/index.js', async () => {
  const actual = await vi.importActual('../../src/config/index.js');
  return {
    ...actual,
    SCOPE_CONFIG: {
      requireFullScope: true,
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

describe('Identity Gate Integration (production posture)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });

    await app.register(requestIdPlugin);
    await app.register(errorHandlerPlugin);
    await app.register(scopeValidatorPlugin);
    await app.register(identityPlugin);

    await app.register(approvalRoutes, { prefix: '/experimental/approvals' });
    await app.register(evidenceRoutes, { prefix: '/experimental/evidence' });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    // no-op placeholder to keep hook symmetry for potential future per-test setup
  });

  it('should reject requests without JWT in production gate', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/experimental/evidence/generate',
      payload: {
        project: 'lsclaw',
        root_dir: fixtureRoot,
        findings: [],
      },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('MISSING_JWT');
  });

  it('should accept valid JWT and derive verified scope for evidence generation', async () => {
    const jwt = createJwt({
      sub: 'actor-service',
      tenant_id: 'tenant-prod',
      project_id: 'project-prod',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/experimental/evidence/generate',
      headers: {
        authorization: `Bearer ${jwt}`,
      },
      payload: {
        scope: {
          tenant_id: 'tenant-prod',
          project_id: 'project-prod',
          actor_id: 'actor-service',
        },
        project: 'lsclaw',
        root_dir: fixtureRoot,
        findings: [],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.data.scope.tenant_id).toBe('tenant-prod');
    expect(body.data.scope.project_id).toBe('project-prod');
    expect(body.data.actor.actor_id).toBe('actor-service');
    expect(body.data.actor.identity_verified).toBe(true);
  });

  it('should reject tampered scope with SCOPE_TAMPERED on approvals', async () => {
    const jwt = createJwt({
      sub: 'actor-service',
      tenant_id: 'tenant-prod',
      project_id: 'project-prod',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/experimental/approvals',
      headers: {
        authorization: `Bearer ${jwt}`,
      },
      payload: {
        scope: {
          tenant_id: 'tenant-evil',
          project_id: 'project-prod',
          actor_id: 'actor-service',
        },
        item_type: 'code_patch',
        item_id: 'item-001',
        title: 'demo',
        description: 'demo',
        risk_level: 'low',
        timeout_seconds: 600,
      },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('SCOPE_TAMPERED');
  });

  it('should record approval requester actor from JWT identity', async () => {
    const jwt = createJwt({
      sub: 'approver-007',
      tenant_id: 'tenant-approver',
      project_id: 'project-approver',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/experimental/approvals',
      headers: {
        authorization: `Bearer ${jwt}`,
      },
      payload: {
        item_type: 'code_patch',
        item_id: 'item-007',
        title: 'demo',
        description: 'scope from JWT',
        risk_level: 'medium',
        timeout_seconds: 600,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.approval.requester.actor_id).toBe('approver-007');
  });
});
