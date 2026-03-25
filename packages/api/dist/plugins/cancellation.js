import fp from 'fastify-plugin';
import { SCAN_LIMITS } from '../config/index.js';
import { TimeoutError } from '../types/errors.js';
function isAbortError(error) {
    return (error instanceof Error &&
        (error.name === 'AbortError' ||
            error.message === 'Scan aborted' ||
            error.message === 'Operation aborted' ||
            error.message === 'Request aborted'));
}
function getCancellationContext(request) {
    return request.cancellationContext;
}
function formatTimeoutMessage() {
    return `Operation exceeded ${SCAN_LIMITS.maxDurationMs}ms limit`;
}
/**
 * 创建带取消支持的 handler 包装器
 * 与 preHandler 初始化的 cancellationContext 共享同一条控制路径
 */
export function withCancellation(handler) {
    return async function cancellationHandler(request, reply) {
        const context = getCancellationContext(request);
        if (!context) {
            throw new Error('Cancellation context is not initialized. Ensure cancellationPlugin is registered before routes.');
        }
        const { signal } = context.abortController;
        try {
            return await handler(request, reply, signal);
        }
        catch (error) {
            if (!signal.aborted && !isAbortError(error)) {
                throw error;
            }
            if (reply.sent || reply.raw.destroyed) {
                request.log.debug({
                    requestId: request.requestId,
                    cancelled_by_client: context.reason === 'client-cancel',
                    cancelled_by_server: context.reason === 'server-timeout',
                    path: request.url,
                    method: request.method,
                }, 'Operation aborted after response stream closed');
                return;
            }
            if (context.timedOut) {
                throw new TimeoutError(formatTimeoutMessage());
            }
            request.log.debug({
                requestId: request.requestId,
                cancelled_by_client: context.reason === 'client-cancel',
                cancelled_by_server: false,
                path: request.url,
                method: request.method,
            }, 'Operation aborted');
            return;
        }
    };
}
/**
 * 取消语义插件
 */
export default fp(async function cancellationPlugin(fastify) {
    fastify.decorate('withCancellation', withCancellation);
    // 添加 preHandler hook，为所有请求准备取消上下文
    fastify.addHook('preHandler', async (request, reply) => {
        const abortController = new AbortController();
        let cleaned = false;
        let timeoutId;
        let reason = 'unknown';
        let timedOut = false;
        const abortForClientDisconnect = () => {
            if (cleaned)
                return;
            reason = 'client-cancel';
            timedOut = false;
            context.reason = reason;
            context.timedOut = timedOut;
            context.cleanup();
            abortController.abort('client-cancel');
            request.log.info({
                requestId: request.requestId,
                cancelled_by_client: true,
                path: request.url,
                method: request.method,
            }, 'Client disconnected');
        };
        const context = {
            abortController,
            reason: 'unknown',
            timedOut: false,
            timeoutId: undefined,
            cleanup() {
                if (cleaned)
                    return;
                cleaned = true;
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                request.raw.off('aborted', onAborted);
                request.raw.off('close', onClose);
                reply.raw.off('close', onClose);
            },
        };
        const onAborted = () => {
            abortForClientDisconnect();
        };
        const onClose = () => {
            if (!request.raw.aborted && !reply.raw.destroyed) {
                return;
            }
            abortForClientDisconnect();
        };
        timeoutId = setTimeout(() => {
            if (cleaned)
                return;
            reason = 'server-timeout';
            timedOut = true;
            context.reason = reason;
            context.timedOut = timedOut;
            context.cleanup();
            abortController.abort('server-timeout');
            request.log.warn({
                requestId: request.requestId,
                timed_out: true,
                limit_ms: SCAN_LIMITS.maxDurationMs,
                path: request.url,
                method: request.method,
            }, 'Server timeout');
        }, SCAN_LIMITS.maxDurationMs);
        context.timeoutId = timeoutId;
        context.reason = reason;
        context.timedOut = timedOut;
        request.cancellationContext = context;
        request.raw.on('aborted', onAborted);
        request.raw.on('close', onClose);
        reply.raw.on('close', onClose);
    });
    fastify.addHook('onSend', async (request) => {
        const context = getCancellationContext(request);
        context?.cleanup();
    });
    fastify.addHook('onError', async (request) => {
        const context = getCancellationContext(request);
        context?.cleanup();
    });
}, {
    name: 'cancellation',
    fastify: '5.x',
});
