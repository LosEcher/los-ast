import fp from 'fastify-plugin';
import { randomUUID } from 'crypto';
/**
 * Request ID 插件
 * - 从请求头读取或生成新的 UUID
 * - 在响应头中返回 requestId
 * - 存储到 request context
 * - 同时处理 trace_id 传播
 */
export default fp(async function requestIdPlugin(fastify) {
    // 注册 onRequest hook
    fastify.addHook('onRequest', async (request, reply) => {
        // 尝试从请求头获取 requestId，否则生成新的
        const requestId = request.headers['x-request-id'] || randomUUID();
        // 尝试从请求头获取 traceId（用于分布式追踪）
        const traceId = request.headers['x-trace-id'] || undefined;
        // 存储到 request context
        request.requestId = requestId;
        if (traceId) {
            request.traceId = traceId;
        }
        // 在响应头中返回 requestId 和 traceId
        reply.header('x-request-id', requestId);
        if (traceId) {
            reply.header('x-trace-id', traceId);
        }
    });
}, {
    name: 'request-id',
    fastify: '5.x',
});
