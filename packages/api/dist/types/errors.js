/**
 * 应用错误基类
 */
export class AppError extends Error {
    category;
    code;
    retryable;
    details;
    constructor(category, code, message, retryable = false, details) {
        super(message);
        this.name = 'AppError';
        this.category = category;
        this.code = code;
        this.retryable = retryable;
        this.details = details;
    }
    toJSON(requestId) {
        return {
            category: this.category,
            code: this.code,
            message: this.message,
            requestId,
            timestamp: new Date().toISOString(),
            retryable: this.retryable,
            details: this.details,
        };
    }
}
/**
 * 验证错误
 */
export class ValidationError extends AppError {
    constructor(code, message, details) {
        super('VALIDATION', code, message, false, details);
    }
}
/**
 * Scope 错误
 */
export class ScopeError extends AppError {
    constructor(code, message) {
        super('SCOPE', code, message, false);
    }
}
/**
 * 超时错误
 */
export class TimeoutError extends AppError {
    constructor(message = 'Request timeout') {
        super('TIMEOUT', 'REQUEST_TIMEOUT', message, true);
    }
}
/**
 * 扫描过大错误
 */
export class ScanTooLargeError extends AppError {
    constructor(limit, estimated) {
        super('SCAN_TOO_LARGE', 'SCAN_TOO_LARGE', `Estimated ${estimated} files exceeds limit ${limit}. Use smaller include patterns or async task mode.`, false, { limit, estimated });
    }
}
/**
 * 资源未找到错误
 */
export class NotFoundError extends AppError {
    constructor(resource, id) {
        super('NOT_FOUND', 'RESOURCE_NOT_FOUND', id ? `${resource} with id '${id}' not found` : `${resource} not found`, false, id ? { resource, id } : { resource });
    }
}
export class AuthenticationError extends AppError {
    constructor(code, message) {
        super('AUTHENTICATION', code, message, false);
    }
}
//# sourceMappingURL=errors.js.map