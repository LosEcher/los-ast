import type { FastifyInstance } from 'fastify';
/**
 * Request ID 插件
 * - 从请求头读取或生成新的 UUID
 * - 在响应头中返回 requestId
 * - 存储到 request context
 */
declare const _default: (fastify: FastifyInstance) => Promise<void>;
export default _default;
//# sourceMappingURL=request-id.d.ts.map