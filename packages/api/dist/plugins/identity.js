import fp from 'fastify-plugin';
import { ScopeError, AuthenticationError } from '../types/errors.js';
import { DEV_ALLOW_UNVERIFIED_IDENTITY, IS_PRODUCTION, JWT_CONFIG, } from '../config/index.js';
async function verifyJWTSignature(token, secret) {
    try {
        const crypto = await import('crypto');
        const parts = token.split('.');
        if (parts.length !== 3)
            return { valid: false };
        const signedContent = `${parts[0]}.${parts[1]}`;
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(signedContent)
            .digest('base64url');
        const actualSignature = parts[2];
        if (actualSignature.length !== expectedSignature.length) {
            return { valid: false };
        }
        const actualBuf = Buffer.from(actualSignature);
        const expectedBuf = Buffer.from(expectedSignature);
        const equal = crypto.timingSafeEqual(actualBuf, expectedBuf);
        if (!equal)
            return { valid: false };
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
        return { valid: true, payload };
    }
    catch {
        return { valid: false };
    }
}
function extractAuthHeader(request) {
    const auth = request.headers.authorization;
    if (!auth)
        return null;
    if (auth.startsWith('Bearer ')) {
        return auth.substring(7);
    }
    return auth;
}
function getStringClaim(payload, claim) {
    const value = payload[claim];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
function assertClientScopeNotTampered(clientScope, verified) {
    const mismatches = [];
    if (clientScope.tenant_id && clientScope.tenant_id !== verified.tenant_id) {
        mismatches.push('tenant_id');
    }
    if (clientScope.project_id && clientScope.project_id !== verified.project_id) {
        mismatches.push('project_id');
    }
    if (clientScope.actor_id && clientScope.actor_id !== verified.actor_id) {
        mismatches.push('actor_id');
    }
    if (mismatches.length > 0) {
        throw new ScopeError('SCOPE_TAMPERED', `Client scope does not match verified identity claims: ${mismatches.join(', ')}`);
    }
}
async function verifyIdentity(request, scope) {
    const token = extractAuthHeader(request);
    if (IS_PRODUCTION && JWT_CONFIG.enforceJWT) {
        if (!token) {
            throw new AuthenticationError('MISSING_JWT', 'JWT token is required in production environment');
        }
        if (!JWT_CONFIG.secret) {
            throw new AuthenticationError('JWT_SECRET_NOT_CONFIGURED', 'JWT_SECRET environment variable is not set');
        }
        const { valid, payload } = await verifyJWTSignature(token, JWT_CONFIG.secret);
        if (!valid) {
            throw new AuthenticationError('INVALID_JWT', 'JWT signature verification failed');
        }
        if (!payload) {
            throw new AuthenticationError('INVALID_JWT_PAYLOAD', 'JWT payload is missing or invalid');
        }
        const actorId = getStringClaim(payload, 'sub');
        if (!actorId) {
            throw new AuthenticationError('MISSING_JWT_SUB', 'JWT missing required "sub" (subject/actor) claim');
        }
        const exp = payload.exp;
        if (exp && Date.now() >= exp * 1000) {
            throw new AuthenticationError('JWT_EXPIRED', 'JWT token has expired');
        }
        const tenantId = getStringClaim(payload, 'tenant_id');
        const projectId = getStringClaim(payload, 'project_id');
        if (!tenantId || !projectId) {
            const missing = [
                !tenantId ? 'tenant_id' : null,
                !projectId ? 'project_id' : null,
            ].filter(Boolean).join(', ');
            throw new ScopeError('INCOMPLETE_SCOPE', `JWT missing required scope claims: ${missing}`);
        }
        assertClientScopeNotTampered(scope, {
            tenant_id: tenantId,
            project_id: projectId,
            actor_id: actorId,
        });
        const verifiedScope = {
            tenant_id: tenantId,
            project_id: projectId,
            actor_id: actorId,
            mode: 'service',
            identity_verified: true,
            identity_source: 'jwt',
        };
        return {
            actor_id: actorId,
            identity_source: 'jwt',
            claims: payload,
            original_scope: scope,
            verified_scope: verifiedScope,
        };
    }
    if (token && JWT_CONFIG.secret) {
        const { valid, payload } = await verifyJWTSignature(token, JWT_CONFIG.secret);
        if (valid && payload) {
            const actorId = getStringClaim(payload, 'sub') || scope.actor_id || 'unknown';
            const tenantId = getStringClaim(payload, 'tenant_id') || scope.tenant_id || 'dev';
            const projectId = getStringClaim(payload, 'project_id') || scope.project_id || 'dev';
            return {
                actor_id: actorId,
                identity_source: 'jwt',
                claims: payload,
                original_scope: scope,
                verified_scope: {
                    tenant_id: tenantId,
                    project_id: projectId,
                    actor_id: actorId,
                    mode: scope.mode || 'local',
                    identity_verified: true,
                    identity_source: 'jwt',
                },
            };
        }
    }
    if (!IS_PRODUCTION) {
        if (!DEV_ALLOW_UNVERIFIED_IDENTITY) {
            throw new AuthenticationError('UNVERIFIED_IDENTITY_DISABLED', 'Unverified identity is disabled in development environment. Set DEV_ALLOW_UNVERIFIED_IDENTITY=true to allow local scope-based identity.');
        }
        console.warn('[IdentityPlugin] Development mode: allowing unverified identity');
        return {
            actor_id: scope.actor_id || 'dev-user',
            identity_source: 'local_dev',
            original_scope: scope,
            verified_scope: {
                tenant_id: scope.tenant_id || 'dev',
                project_id: scope.project_id || 'dev',
                actor_id: scope.actor_id || 'dev-user',
                mode: scope.mode || 'local',
                identity_verified: false,
                identity_source: 'local_dev',
            },
        };
    }
    throw new AuthenticationError('IDENTITY_VERIFICATION_FAILED', 'Unable to verify identity');
}
export default fp(async function identityPlugin(fastify) {
    fastify.addHook('preHandler', async (request) => {
        if (request.url.startsWith('/healthz')) {
            return;
        }
        if (!request.scope) {
            throw new ScopeError('SCOPE_NOT_VALIDATED', 'Identity validation requires scope to be validated first');
        }
        const identity = await verifyIdentity(request, request.scope);
        request.identity = identity;
        request.scope = identity.verified_scope;
    });
}, {
    name: 'identity',
    fastify: '5.x',
    dependencies: ['scope-validator'],
});
//# sourceMappingURL=identity.js.map