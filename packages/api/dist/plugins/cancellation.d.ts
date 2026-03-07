import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
/**
 * 取消语义插件（硬约束 #5）
 *
 * 区分两种取消场景：
 * 1. Client Cancel - HTTP 连接断开
 * 2. Server Timeout - 超过 max_duration_ms
 */
/**
 * 创建带取消支持的 handler 包装器
 */
export declare function withCancellation(handler: (request: FastifyRequest, reply: FastifyReply, signal: AbortSignal) => Promise<unknown>): (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
/**
 * 取消语义插件
 * 为所有路由添加取消支持
 */
declare const _default: (fastify: FastifyInstance) => Promise<void>;
export default _default;
declare module 'fastify' {
    interface FastifyInstance {
        withCancellation: typeof withCancellation;
    }
    interface FastifyRequest {
        abortController?: AbortController;
        cleanupCancellation?: () => void;
    }
}
//# sourceMappingURL=cancellation.d.ts.map