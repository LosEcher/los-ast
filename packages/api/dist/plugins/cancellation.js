import fp from 'fastify-plugin';
import { SCAN_LIMITS } from '../config/index.js';
import { TimeoutError } from '../types/errors.js';
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
export function withCancellation(handler) {
    return async function cancellationHandler(request, reply) {
        const abortController = new AbortController();
        const { signal } = abortController;
        // 标记是否已处理取消，防止重复处理
        let isCancelled = false;
        // Client disconnect 检测
        const onClose = () => {
            if (isCancelled || reply.sent)
                return;
            isCancelled = true;
            request.log.info({
                requestId: request.requestId,
                cancelled_by_client: true,
                path: request.url,
                method: request.method,
            }, 'Client disconnected, aborting operation');
            abortController.abort();
            // 调用 hijack 阻止 Fastify 继续发送响应（连接已断开）
            try {
                reply.hijack();
            }
            catch {
                // hijack 可能失败，忽略错误
            }
        };
        reply.raw.on('close', onClose);
        // Server timeout 设置
        const timeoutMs = SCAN_LIMITS.maxDurationMs;
        const timeoutId = setTimeout(() => {
            if (isCancelled || reply.sent)
                return;
            isCancelled = true;
            request.log.warn({
                requestId: request.requestId,
                timed_out: true,
                limit_ms: timeoutMs,
                path: request.url,
                method: request.method,
            }, 'Operation timed out');
            abortController.abort();
        }, timeoutMs);
        try {
            const result = await handler(request, reply, signal);
            // 如果已经取消，不继续处理
            if (isCancelled) {
                return;
            }
            // 正常完成，清除 timeout
            clearTimeout(timeoutId);
            reply.raw.off('close', onClose);
            return result;
        }
        catch (error) {
            // 清除 timeout 和监听器
            clearTimeout(timeoutId);
            reply.raw.off('close', onClose);
            // 如果是取消导致的错误
            if (signal.aborted) {
                // Client cancel - 连接已断开，不需要返回错误
                if (reply.raw.destroyed || reply.raw.writableEnded) {
                    request.log.debug({
                        requestId: request.requestId,
                        cancelled_by_client: true,
                    }, 'Operation aborted by client, connection closed');
                    return;
                }
                // Server timeout - 返回 408
                if (!reply.sent) {
                    throw new TimeoutError(`Operation exceeded ${timeoutMs}ms limit`);
                }
                return;
            }
            // 其他错误，继续抛出
            throw error;
        }
    };
}
/**
 * 取消语义插件
 * 为所有路由添加取消支持
 */
export default fp(async function cancellationPlugin(fastify) {
    // 添加 decorate 以便在路由中使用
    fastify.decorate('withCancellation', withCancellation);
    // 添加 preHandler hook，为所有请求准备取消上下文
    fastify.addHook('preHandler', async (request, reply) => {
        // 创建 AbortController 并存储到 request 上下文
        const abortController = new AbortController();
        request.abortController = abortController;
        let isCancelled = false;
        // Client disconnect 检测
        const onClose = () => {
            if (isCancelled || reply.sent)
                return;
            isCancelled = true;
            request.log.info({
                requestId: request.requestId,
                cancelled_by_client: true,
                path: request.url,
                method: request.method,
            }, 'Client disconnected');
            abortController.abort();
        };
        reply.raw.on('close', onClose);
        // Server timeout
        const timeoutId = setTimeout(() => {
            if (isCancelled || reply.sent)
                return;
            isCancelled = true;
            request.log.warn({
                requestId: request.requestId,
                timed_out: true,
                limit_ms: SCAN_LIMITS.maxDurationMs,
                path: request.url,
                method: request.method,
            }, 'Server timeout');
            abortController.abort();
        }, SCAN_LIMITS.maxDurationMs);
        // 存储清理函数
        request.cleanupCancellation = () => {
            clearTimeout(timeoutId);
            reply.raw.off('close', onClose);
        };
    });
    // 在请求结束时清理
    fastify.addHook('onSend', async (request) => {
        const cleanup = request.cleanupCancellation;
        if (cleanup) {
            cleanup();
        }
    });
    fastify.addHook('onError', async (request) => {
        const cleanup = request.cleanupCancellation;
        if (cleanup) {
            cleanup();
        }
    });
}, {
    name: 'cancellation',
    fastify: '5.x',
});
//# sourceMappingURL=cancellation.js.map