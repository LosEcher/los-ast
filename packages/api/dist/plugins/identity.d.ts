import type { FastifyInstance } from 'fastify';
import type { Scope, VerifiedScope } from '@los-ast/shared/types';
export interface IdentityContext {
    actor_id: string;
    identity_source: 'jwt' | 'service_token' | 'local_dev';
    claims?: Record<string, unknown>;
    original_scope: Scope;
    verified_scope: VerifiedScope;
}
declare module 'fastify' {
    interface FastifyRequest {
        identity?: IdentityContext;
    }
}
declare const _default: (fastify: FastifyInstance) => Promise<void>;
export default _default;
//# sourceMappingURL=identity.d.ts.map