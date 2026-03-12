import {
  DEFAULT_EXCERPT_LENGTH,
  DEFAULT_PARSE_CACHE_MAX_ENTRIES,
  PARSE_FAILURE_SAMPLE_LIMIT,
} from '@los-ast/core';

import { DEFAULT_SCAN_LIMITS } from '../../config/index.js';

export const SCAN_ERROR_CATEGORY_VALUES = [
  'VALIDATION',
  'SCOPE',
  'AUTHENTICATION',
  'TIMEOUT',
  'SCAN_TOO_LARGE',
  'NOT_FOUND',
  'SERVICE_UNAVAILABLE',
  'INTERNAL',
] as const;

export const SCAN_ENDPOINT_ERROR_REFERENCE = [
  {
    httpStatus: 400,
    category: 'VALIDATION',
    code: 'INVALID_PROJECT',
    description: 'Project field missing or invalid',
  },
  {
    httpStatus: 400,
    category: 'VALIDATION',
    code: 'INVALID_SCAN_INPUT',
    description: 'Neither `rootDir` nor any native contract/schema input set was provided',
  },
  {
    httpStatus: 400,
    category: 'VALIDATION',
    code: 'INVALID_ROOTDIR',
    description: 'rootDir field missing or invalid when the request implies AST/code scanning',
  },
  {
    httpStatus: 401,
    category: 'AUTHENTICATION',
    code: 'MISSING_JWT` / `INVALID_JWT` / `JWT_EXPIRED` / `UNVERIFIED_IDENTITY_DISABLED',
    description: 'Identity or JWT verification failed when the identity plugin is enforced',
  },
  {
    httpStatus: 403,
    category: 'SCOPE',
    code: 'SCOPE_ERROR',
    description: 'Scope/permission issue',
  },
  {
    httpStatus: 404,
    category: 'NOT_FOUND',
    code: 'RESOURCE_NOT_FOUND',
    description: 'Requested resource not found',
  },
  {
    httpStatus: 404,
    category: 'NOT_FOUND',
    code: 'ROUTE_NOT_FOUND',
    description: 'API endpoint not found',
  },
  {
    httpStatus: 408,
    category: 'TIMEOUT',
    code: 'REQUEST_TIMEOUT',
    description: 'Scan exceeded time limit',
  },
  {
    httpStatus: 413,
    category: 'SCAN_TOO_LARGE',
    code: 'SCAN_TOO_LARGE',
    description: 'Response size exceeds limit',
  },
  {
    httpStatus: 500,
    category: 'INTERNAL',
    code: 'INTERNAL_ERROR',
    description: 'Unexpected server error',
  },
  {
    httpStatus: 500,
    category: 'INTERNAL',
    code: 'UNKNOWN_ERROR',
    description: 'Unknown error type',
  },
  {
    httpStatus: 503,
    category: 'SERVICE_UNAVAILABLE',
    code: 'CORE_NOT_READY',
    description: 'Core is not ready, explicit fallback path',
  },
] as const;

export const SCAN_LIMIT_REFERENCE = [
  {
    name: 'Max Files (Sync)',
    value: String(DEFAULT_SCAN_LIMITS.maxFilesPerSyncScan),
    description: 'Maximum files per synchronous scan',
  },
  {
    name: 'Response Size',
    value: `${Math.round(DEFAULT_SCAN_LIMITS.maxResponseBytes / 1024 / 1024)}MB`,
    description: 'Maximum JSON response size',
  },
  {
    name: 'Timeout',
    value: `${Math.round(DEFAULT_SCAN_LIMITS.maxDurationMs / 1000)}s`,
    description: 'Maximum scan duration',
  },
  {
    name: 'Excerpt Length',
    value: `${DEFAULT_EXCERPT_LENGTH} chars`,
    description: 'Default maximum finding excerpt length',
  },
  {
    name: 'Cache Entries',
    value: String(DEFAULT_PARSE_CACHE_MAX_ENTRIES),
    description: 'Default parse cache capacity exposed by `parseCache.maxEntries`',
  },
  {
    name: 'Parse Failure Samples',
    value: String(PARSE_FAILURE_SAMPLE_LIMIT),
    description: 'Maximum parse failure samples included when `includeStats=true`',
  },
] as const;
