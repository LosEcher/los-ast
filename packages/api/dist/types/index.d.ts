export * from '@los-ast/shared/types';
import type { ApiError } from '@los-ast/shared/types';
/**
 * Fastify 扩展类型声明
 */
declare module 'fastify' {
    interface FastifyRequest {
        scope?: {
            tenant_id?: string;
            project_id?: string;
            actor_id?: string;
            mode?: 'local' | 'service';
        };
        requestId: string;
    }
    interface FastifyReply {
        sendError: (status: number, error: ApiError) => void;
    }
}
//# sourceMappingURL=index.d.ts.map