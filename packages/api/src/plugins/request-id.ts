import fp from 'fastify-plugin';
import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * Request ID 插件
 * - 从请求头读取或生成新的 UUID
 * - 在响应头中返回 requestId
 * - 存储到 request context
 */
export default fp(async function requestIdPlugin(fastify: FastifyInstance) {
  // 注册 onRequest hook
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // 尝试从请求头获取 requestId，否则生成新的
    const requestId = request.headers['x-request-id'] as string || randomUUID();
    
    // 存储到 request context
    request.requestId = requestId;
    
    // 在响应头中返回 requestId
    reply.header('x-request-id', requestId);
  });
}, {
  name: 'request-id',
  fastify: '5.x',
});
