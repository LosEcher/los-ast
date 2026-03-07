import type { ApiError, ErrorCategory } from '@los-ast/shared/types';

/**
 * 应用错误基类
 */
export class AppError extends Error {
  public readonly category: ErrorCategory;
  public readonly code: string;
  public readonly retryable: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    category: ErrorCategory,
    code: string,
    message: string,
    retryable: boolean = false,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    this.category = category;
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }

  toJSON(requestId: string): ApiError {
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
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super('VALIDATION', code, message, false, details);
  }
}

/**
 * Scope 错误
 */
export class ScopeError extends AppError {
  constructor(code: string, message: string) {
    super('SCOPE', code, message, false);
  }
}

/**
 * 超时错误
 */
export class TimeoutError extends AppError {
  constructor(message: string = 'Request timeout') {
    super('TIMEOUT', 'REQUEST_TIMEOUT', message, true);
  }
}

/**
 * 扫描过大错误
 */
export class ScanTooLargeError extends AppError {
  constructor(limit: number, estimated: number) {
    super(
      'SCAN_TOO_LARGE',
      'SCAN_TOO_LARGE',
      `Estimated ${estimated} files exceeds limit ${limit}. Use smaller include patterns or async task mode.`,
      false,
      { limit, estimated }
    );
  }
}
