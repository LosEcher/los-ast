/**
 * HTTP 响应帮助函数
 * 统一 API 响应格式
 */
import type { FastifyReply } from 'fastify';
/**
 * 404 Not Found 响应
 */
export declare function notFound(reply: FastifyReply, resource: string): {
    error: {
        message: string;
    };
};
/**
 * 201 Created 响应
 */
export declare function created<T>(reply: FastifyReply, data: T): {
    data: T;
};
/**
 * 400 Bad Request 响应
 */
export declare function badRequest(reply: FastifyReply, message: string): {
    error: {
        message: string;
    };
};
/**
 * 200 OK 响应 (带数据)
 */
export declare function ok<T>(data: T): {
    data: T;
};
/**
 * 204 No Content 响应
 */
export declare function noContent(reply: FastifyReply): string;
//# sourceMappingURL=http-helpers.d.ts.map