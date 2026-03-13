/**
 * HTTP 响应帮助函数
 * 统一 API 响应格式
 */
/**
 * 404 Not Found 响应
 */
export function notFound(reply, resource) {
    reply.status(404);
    return { error: { message: `${resource} not found` } };
}
/**
 * 201 Created 响应
 */
export function created(reply, data) {
    reply.status(201);
    return { data };
}
/**
 * 400 Bad Request 响应
 */
export function badRequest(reply, message) {
    reply.status(400);
    return { error: { message } };
}
/**
 * 200 OK 响应 (带数据)
 */
export function ok(data) {
    return { data };
}
/**
 * 204 No Content 响应
 */
export function noContent(reply) {
    reply.status(204);
    return '';
}
