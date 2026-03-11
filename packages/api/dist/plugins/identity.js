import fp from 'fastify-plugin';
import { ScopeError, AuthenticationError } from '../types/errors.js';
import { IS_PRODUCTION, JWT_CONFIG } from '../config/index.js';
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
        const actorId = payload.sub;
        if (!actorId) {
            throw new AuthenticationError('MISSING_JWT_SUB', 'JWT missing required "sub" (subject/actor) claim');
        }
        const exp = payload.exp;
        if (exp && Date.now() >= exp * 1000) {
            throw new AuthenticationError('JWT_EXPIRED', 'JWT token has expired');
        }
        const verifiedScope = {
            tenant_id: scope.tenant_id || payload.tenant_id,
            project_id: scope.project_id || payload.project_id,
            actor_id: actorId,
            mode: 'service',
            identity_verified: true,
            identity_source: 'jwt',
        };
        if (!verifiedScope.tenant_id || !verifiedScope.project_id) {
            throw new ScopeError('INCOMPLETE_SCOPE', `Verified scope missing: ${!verifiedScope.tenant_id ? 'tenant_id' : 'project_id'}`);
        }
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
            const actorId = payload.sub || scope.actor_id || 'unknown';
            return {
                actor_id: actorId,
                identity_source: 'jwt',
                claims: payload,
                original_scope: scope,
                verified_scope: {
                    tenant_id: scope.tenant_id || payload.tenant_id || 'dev',
                    project_id: scope.project_id || payload.project_id || 'dev',
                    actor_id: actorId,
                    mode: scope.mode || 'local',
                    identity_verified: true,
                    identity_source: 'jwt',
                },
            };
        }
    }
    if (!IS_PRODUCTION) {
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