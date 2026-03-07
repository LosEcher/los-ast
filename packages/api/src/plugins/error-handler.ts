import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../types/errors.js';
import type { ErrorCategory, ApiError } from '@los-ast/shared/types';

/**
 * 错误类别到 HTTP 状态码的映射
 */
const ERROR_STATUS_MAP: Record<ErrorCategory, number> = {
  VALIDATION: 400,
  SCOPE: 403,  // 使用 403 表示权限/Scope 问题
  TIMEOUT: 408,
  SCAN_TOO_LARGE: 413,
  NOT_FOUND: 404,
  INTERNAL: 500,
};

/**
 * 判断是否为 AppError 类型
 */
function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * 转换错误为统一 API 错误格式
 */
function normalizeError(error: unknown, requestId: string): ApiError {
  if (isAppError(error)) {
    return error.toJSON(requestId);
  }

  // 处理 Fastify 验证错误
  if (error && typeof error === 'object' && 'validation' in error) {
    const fastifyError = error as FastifyError;
    return {
      category: 'VALIDATION',
      code: 'VALIDATION_ERROR',
      message: fastifyError.message || 'Request validation failed',
      requestId,
      timestamp: new Date().toISOString(),
      retryable: false,
      details: { validation: fastifyError.validation },
    };
  }

  // 处理普通 Error
  if (error instanceof Error) {
    return {
      category: 'INTERNAL',
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : error.message,
      requestId,
      timestamp: new Date().toISOString(),
      retryable: false,
      details: process.env.NODE_ENV === 'development' ? { stack: error.stack } : undefined,
    };
  }

  // 未知错误类型
  return {
    category: 'INTERNAL',
    code: 'UNKNOWN_ERROR',
    message: 'An unknown error occurred',
    requestId,
    timestamp: new Date().toISOString(),
    retryable: false,
  };
}

/**
 * 获取 HTTP 状态码
 */
function getHttpStatus(error: unknown): number {
  if (isAppError(error)) {
    return ERROR_STATUS_MAP[error.category] || 500;
  }
  
  // Fastify 验证错误
  if (error && typeof error === 'object' && 'statusCode' in error) {
    return (error as FastifyError).statusCode || 500;
  }
  
  return 500;
}

/**
 * 错误处理插件
 * 统一处理所有错误并转换为标准格式
 */
export default fp(async function errorHandlerPlugin(fastify: FastifyInstance) {
  // 设置全局错误处理函数
  fastify.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const requestId = request.requestId || 'unknown';
    const statusCode = getHttpStatus(error);
    const apiError = normalizeError(error, requestId);

    // 结构化日志记录
    const logData = {
      requestId,
      category: apiError.category,
      code: apiError.code,
      statusCode,
      path: request.url,
      method: request.method,
      message: apiError.message,
      retryable: apiError.retryable,
    };

    // 根据错误级别选择日志级别
    if (statusCode >= 500) {
      request.log.error(logData, 'Request error');
    } else if (statusCode >= 400) {
      request.log.warn(logData, 'Client error');
    }

    // 发送统一格式错误响应
    reply.status(statusCode).send({ error: apiError });
  });

  // 设置未找到路由处理
  fastify.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    const requestId = request.requestId || 'unknown';
    const apiError: ApiError = {
      category: 'NOT_FOUND',
      code: 'ROUTE_NOT_FOUND',
      message: `Route ${request.method} ${request.url} not found`,
      requestId,
      timestamp: new Date().toISOString(),
      retryable: false,
    };

    request.log.warn({
      requestId,
      path: request.url,
      method: request.method,
    }, 'Route not found');

    reply.status(404).send({ error: apiError });
  });
}, {
  name: 'error-handler',
  fastify: '5.x',
});
