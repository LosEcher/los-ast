import type { ApiError, ErrorCategory } from '@los-ast/shared/types';
/**
 * 应用错误基类
 */
export declare class AppError extends Error {
    readonly category: ErrorCategory;
    readonly code: string;
    readonly retryable: boolean;
    readonly details?: Record<string, unknown>;
    constructor(category: ErrorCategory, code: string, message: string, retryable?: boolean, details?: Record<string, unknown>);
    toJSON(requestId: string): ApiError;
}
/**
 * 验证错误
 */
export declare class ValidationError extends AppError {
    constructor(code: string, message: string, details?: Record<string, unknown>);
}
/**
 * Scope 错误
 */
export declare class ScopeError extends AppError {
    constructor(code: string, message: string);
}
/**
 * 超时错误
 */
export declare class TimeoutError extends AppError {
    constructor(message?: string);
}
/**
 * 扫描过大错误
 */
export declare class ScanTooLargeError extends AppError {
    constructor(limit: number, estimated: number);
}
/**
 * 资源未找到错误
 */
export declare class NotFoundError extends AppError {
    constructor(resource: string, id?: string);
}
export declare class AuthenticationError extends AppError {
    constructor(code: string, message: string);
}
//# sourceMappingURL=errors.d.ts.map