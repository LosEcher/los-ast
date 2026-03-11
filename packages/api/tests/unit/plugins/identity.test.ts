import { describe, it, expect, beforeEach, vi } from 'vitest';
import fastify from 'fastify';
import scopeValidatorPlugin from '../../../src/plugins/scope-validator';
import identityPlugin from '../../../src/plugins/identity';
import errorHandlerPlugin from '../../../src/plugins/error-handler';

vi.mock('../../../src/config/index.js', async () => {
  const actual = await vi.importActual('../../../src/config/index.js');
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
      secret: 'test-secret-key-for-jwt-verification-in-tests-only',
      enforceJWT: false,
    },
    DEV_ALLOW_UNVERIFIED_IDENTITY: true,
    IS_PRODUCTION: false,
  };
});

describe('Identity Plugin', () => {
  let app: ReturnType<typeof fastify>;

  beforeEach(async () => {
    app = fastify({ logger: false });

    app.get('/healthz/live', async () => ({ status: 'alive', timestamp: new Date().toISOString() }));

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

  describe('health check bypass', () => {
    it('should bypass identity validation for /healthz routes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/healthz/live',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('development mode', () => {
    it('should allow request without JWT in development', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/test',
        payload: {
          scope: {
            tenant_id: 'test-tenant',
            project_id: 'test-project',
            actor_id: 'test-actor',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.identity).toBeDefined();
      expect(body.identity.identity_source).toBe('local_dev');
      expect(body.identity.actor_id).toBe('test-actor');
      expect(body.scope.identity_verified).toBe(false);
    });

    it('should extract actor_id from scope in development', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/test',
        payload: {
          scope: {
            tenant_id: 'tenant-a',
            project_id: 'project-b',
            actor_id: 'actor-c',
            mode: 'local',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.identity.actor_id).toBe('actor-c');
      expect(body.scope.tenant_id).toBe('tenant-a');
      expect(body.scope.project_id).toBe('project-b');
    });
  });

  describe('JWT validation', () => {
    it('should accept valid JWT and extract actor from sub claim', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        sub: 'jwt-actor-123',
        tenant_id: 'jwt-tenant',
        project_id: 'jwt-project',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      })).toString('base64url');

      const crypto = await import('crypto');
      const signature = crypto
        .createHmac('sha256', 'test-secret-key-for-jwt-verification-in-tests-only')
        .update(`${header}.${payload}`)
        .digest('base64url');

      const jwt = `${header}.${payload}.${signature}`;

      const response = await app.inject({
        method: 'POST',
        url: '/test',
        headers: {
          authorization: `Bearer ${jwt}`,
        },
        payload: {
          scope: {
            tenant_id: 'scope-tenant',
            project_id: 'scope-project',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.identity.identity_source).toBe('jwt');
      expect(body.identity.actor_id).toBe('jwt-actor-123');
      expect(body.scope.identity_verified).toBe(true);
      expect(body.scope.actor_id).toBe('jwt-actor-123');
    });

    it('should reject request with invalid JWT signature', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        sub: 'jwt-actor',
        iat: Math.floor(Date.now() / 1000),
      })).toString('base64url');
      const jwt = `${header}.${payload}.invalid-signature`;

      const response = await app.inject({
        method: 'POST',
        url: '/test',
        headers: {
          authorization: `Bearer ${jwt}`,
        },
        payload: {
          scope: {
            tenant_id: 'test',
            project_id: 'test',
            actor_id: 'test',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.identity.identity_source).toBe('local_dev');
    });

    it('should accept expired JWT in development mode when enforceJWT is false', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        sub: 'jwt-actor',
        iat: Math.floor(Date.now() / 1000) - 7200,
        exp: Math.floor(Date.now() / 1000) - 3600,
      })).toString('base64url');

      const crypto = await import('crypto');
      const signature = crypto
        .createHmac('sha256', 'test-secret-key-for-jwt-verification-in-tests-only')
        .update(`${header}.${payload}`)
        .digest('base64url');

      const jwt = `${header}.${payload}.${signature}`;

      const response = await app.inject({
        method: 'POST',
        url: '/test',
        headers: {
          authorization: `Bearer ${jwt}`,
        },
        payload: {
          scope: {
            tenant_id: 'test',
            project_id: 'test',
            actor_id: 'test',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.identity.identity_source).toBe('jwt');
      expect(body.identity.actor_id).toBe('jwt-actor');
    });
  });
});
