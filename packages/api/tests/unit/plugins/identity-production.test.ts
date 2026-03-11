import { describe, it, expect, beforeEach, vi } from 'vitest';
import fastify from 'fastify';
import { createHmac } from 'node:crypto';
import scopeValidatorPlugin from '../../../src/plugins/scope-validator';
import identityPlugin from '../../../src/plugins/identity';
import errorHandlerPlugin from '../../../src/plugins/error-handler';

const { JWT_SECRET } = vi.hoisted(() => ({
  JWT_SECRET: 'test-secret-key-for-production-scope-tests',
}));

vi.mock('../../../src/config/index.js', async () => {
  const actual = await vi.importActual('../../../src/config/index.js');
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

describe('Identity Plugin (production scope derivation)', () => {
  let app: ReturnType<typeof fastify>;

  beforeEach(async () => {
    app = fastify({ logger: false });

    await app.register(errorHandlerPlugin);
    await app.register(scopeValidatorPlugin);
    await app.register(identityPlugin);

    app.post('/test', async (request) => {
      return {
        success: true,
        identity: request.identity,
        scope: request.scope,
      };
    });
  });

  it('should derive verified scope from JWT claims when request scope is missing', async () => {
    const jwt = createJwt({
      sub: 'jwt-actor-1',
      tenant_id: 'tenant-from-jwt',
      project_id: 'project-from-jwt',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/test',
      headers: {
        authorization: `Bearer ${jwt}`,
      },
      payload: {
        project: 'any',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.scope.tenant_id).toBe('tenant-from-jwt');
    expect(body.scope.project_id).toBe('project-from-jwt');
    expect(body.scope.actor_id).toBe('jwt-actor-1');
    expect(body.scope.identity_verified).toBe(true);
    expect(body.scope.identity_source).toBe('jwt');
  });

  it('should reject tampered client scope when JWT claims do not match', async () => {
    const jwt = createJwt({
      sub: 'jwt-actor-2',
      tenant_id: 'tenant-jwt',
      project_id: 'project-jwt',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/test',
      headers: {
        authorization: `Bearer ${jwt}`,
      },
      payload: {
        scope: {
          tenant_id: 'tenant-tampered',
          project_id: 'project-jwt',
          actor_id: 'jwt-actor-2',
        },
      },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('SCOPE_TAMPERED');
  });

  it('should reject missing JWT in production mode', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/test',
      payload: {},
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('MISSING_JWT');
  });
});
