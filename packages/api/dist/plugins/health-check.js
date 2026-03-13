import fp from 'fastify-plugin';
import { isReady } from '@los-ast/core';
/**
 * 健康检查插件
 * 提供 /healthz/live 和 /healthz/ready 端点
 */
export default fp(async function healthCheckPlugin(fastify) {
    // Liveness probe - 服务是否存活
    fastify.get('/healthz/live', async () => {
        return { status: 'alive', timestamp: new Date().toISOString() };
    });
    // Readiness probe - 服务是否准备好接收流量
    fastify.get('/healthz/ready', async (_, reply) => {
        const ready = isReady();
        const timestamp = new Date().toISOString();
        if (ready) {
            return { status: 'ready', timestamp };
        }
        else {
            reply.status(503);
            return { status: 'unavailable', timestamp };
        }
    });
}, {
    name: 'health-check',
    fastify: '5.x',
});
