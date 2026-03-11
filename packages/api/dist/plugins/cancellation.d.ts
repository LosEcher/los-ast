import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
/**
 * 取消语义插件（硬约束 #5）
 *
 * 区分两种取消场景：
 * 1. Client Cancel - HTTP 连接断开
 * 2. Server Timeout - 超过 max_duration_ms
 */
type CancellationReason = 'client-cancel' | 'server-timeout' | 'unknown';
interface CancellationContext {
    abortController: AbortController;
    reason: CancellationReason;
    timedOut: boolean;
    timeoutId: NodeJS.Timeout | undefined;
    cleanup(): void;
}
/**
 * 创建带取消支持的 handler 包装器
 * 与 preHandler 初始化的 cancellationContext 共享同一条控制路径
 */
export declare function withCancellation(handler: (request: FastifyRequest, reply: FastifyReply, signal: AbortSignal) => Promise<unknown>): (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
/**
 * 取消语义插件
 */
declare const _default: (fastify: FastifyInstance) => Promise<void>;
export default _default;
declare module 'fastify' {
    interface FastifyInstance {
        withCancellation: typeof withCancellation;
    }
    interface FastifyRequest {
        cancellationContext?: CancellationContext;
    }
}
//# sourceMappingURL=cancellation.d.ts.map