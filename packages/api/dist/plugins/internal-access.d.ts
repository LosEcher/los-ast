/**
 * Internal Route Access Control Plugin
 * 内部路由访问控制插件
 *
 * 为 Internal 层路由提供访问控制：
 * - IP 白名单检查
 * - 内部 Token 验证
 */
import type { FastifyInstance } from 'fastify';
/**
 * 内部访问配置
 */
export interface InternalAccessConfig {
    /** 允许的 IP 地址列表 */
    allowedIps?: string[];
    /** 内部访问 Token */
    internalToken?: string;
    /** 是否允许本地访问 */
    allowLocalhost?: boolean;
}
/**
 * Internal 路由访问控制插件
 */
declare const _default: (fastify: FastifyInstance) => Promise<void>;
export default _default;
/**
 * 生成内部访问 Token
 * 用于生成安全的随机 Token
 */
export declare function generateInternalToken(): string;
//# sourceMappingURL=internal-access.d.ts.map