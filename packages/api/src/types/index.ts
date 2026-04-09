export * from '@los-ast/shared/types';

import type { ApiError, Scope, VerifiedScope } from '@los-ast/shared/types';

/**
 * Fastify 扩展类型声明
 */
declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Request scope - initially set by scope-validator as Scope,
     * then upgraded to VerifiedScope by identity plugin after verification
     */
    scope?: Scope | VerifiedScope;
    requestId: string;
    traceId?: string;
  }

  interface FastifyReply {
    sendError: (status: number, error: ApiError) => void;
  }
}
