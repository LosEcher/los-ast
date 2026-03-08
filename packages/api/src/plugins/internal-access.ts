/**
 * Internal Route Access Control Plugin
 * 内部路由访问控制插件
 *
 * 为 Internal 层路由提供访问控制：
 * - IP 白名单检查
 * - 内部 Token 验证
 */

import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ScopeError } from '../types/errors.js';

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
 * 获取内部访问配置
 */
function getInternalAccessConfig(): InternalAccessConfig {
  return {
    allowedIps: process.env.INTERNAL_ROUTES_ALLOWED_IPS?.split(',').map(ip => ip.trim()),
    internalToken: process.env.INTERNAL_ROUTES_TOKEN,
    allowLocalhost: process.env.INTERNAL_ROUTES_ALLOW_LOCALHOST !== 'false',
  };
}

/**
 * 检查 IP 是否在白名单中
 */
function isIpAllowed(clientIp: string, config: InternalAccessConfig): boolean {
  // 本地地址检查
  if (config.allowLocalhost) {
    const localAddresses = ['127.0.0.1', '::1', 'localhost'];
    if (localAddresses.includes(clientIp)) {
      return true;
    }
  }

  // IP 白名单检查
  if (config.allowedIps && config.allowedIps.length > 0) {
    return config.allowedIps.includes(clientIp);
  }

  // 如果没有配置白名单，默认拒绝（除了本地）
  return false;
}

/**
 * 验证内部 Token
 */
function verifyInternalToken(request: FastifyRequest, config: InternalAccessConfig): boolean {
  if (!config.internalToken) {
    // 如果没有配置 Token，则仅依赖 IP 检查
    return true;
  }

  const authHeader = request.headers.authorization;
  if (!authHeader) {
    return false;
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return false;
  }

  return token === config.internalToken;
}

/**
 * Internal 路由访问控制插件
 */
export default fp(async function internalAccessPlugin(fastify: FastifyInstance) {
  const config = getInternalAccessConfig();

  // 注册 onRequest hook 进行访问控制
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    // 只验证 Internal 路由
    if (!request.url.startsWith('/internal')) {
      return;
    }

    // 获取客户端 IP
    const clientIp = request.ip ||
      (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      'unknown';

    // IP 白名单检查
    if (!isIpAllowed(clientIp, config)) {
      throw new ScopeError(
        'INTERNAL_ACCESS_DENIED',
        `Access denied for IP: ${clientIp}. Internal routes are restricted.`
      );
    }

    // Token 验证（如果配置了 Token）
    if (config.internalToken && !verifyInternalToken(request, config)) {
      throw new ScopeError(
        'INTERNAL_TOKEN_INVALID',
        'Invalid or missing internal access token'
      );
    }
  });
}, {
  name: 'internal-access',
  fastify: '5.x',
});

/**
 * 生成内部访问 Token
 * 用于生成安全的随机 Token
 */
export function generateInternalToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const length = 64;
  let token = '';
  for (let i = 0; i < length; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}
