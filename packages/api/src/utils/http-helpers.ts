/**
 * HTTP 响应帮助函数
 * 统一 API 响应格式
 */

import type { FastifyReply } from 'fastify';

/**
 * 404 Not Found 响应
 */
export function notFound(reply: FastifyReply, resource: string) {
  reply.status(404);
  return { error: { message: `${resource} not found` } };
}

/**
 * 201 Created 响应
 */
export function created<T>(reply: FastifyReply, data: T) {
  reply.status(201);
  return { data };
}

/**
 * 400 Bad Request 响应
 */
export function badRequest(reply: FastifyReply, message: string) {
  reply.status(400);
  return { error: { message } };
}

/**
 * 200 OK 响应 (带数据)
 */
export function ok<T>(data: T) {
  return { data };
}

/**
 * 204 No Content 响应
 */
export function noContent(reply: FastifyReply) {
  reply.status(204);
  return '';
}
