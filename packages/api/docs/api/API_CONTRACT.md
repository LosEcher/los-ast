# los-ast Scan API v1 Contract

**Version:** 1.0.0
**Stability:** Stable (frozen for remote evidence interface)
**Last Updated:** 2026-03-11

## Overview

This document defines the stable API contract for the los-ast scan endpoint. The `/scan` endpoint provides synchronous code analysis with rule-based pattern matching. This contract is frozen and guaranteed to remain backward-compatible for the v1 lifecycle.

## Endpoint

```
POST /scan
```

## Request Schema

### Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes | Must be `application/json` |
| `X-Request-ID` | No | Client-provided request identifier (UUID v4 recommended) |

### Body

```typescript
interface ScanRequest {
  scope?: {
    tenant_id?: string;    // Multi-tenant isolation
    project_id?: string;   // Project context
    actor_id?: string;     // Actor performing the scan
    mode?: 'local' | 'service';  // Execution mode
  };
  project: string;         // Project identifier (non-empty)
  rootDir: string;         // Absolute path to scan root (non-empty)
  include?: string[];      // Glob patterns for file inclusion
  ignore?: string[];       // Glob patterns for file exclusion
  rules?: string[];        // Rule file glob patterns (default: auto-resolve)
  includeStats?: boolean;  // Include parse cache statistics
  deterministic?: boolean; // Default: true (stable sorting, fixed timestamps)
  contractArtifacts?: Array<{
    source?: string;                 // 契约来源标签
    ruleId?: string;                 // 规则标识
    severity?: 'info' | 'warning' | 'error';
    message?: string;                // 规则内容（required if ruleId missing）
    file?: string;                   // 关联文件路径
    language?: string;               // 默认 contract
    line?: number;                   // 未提供 range 时回退
    column?: number;                 // 未提供 range 时回退
    startIndex?: number;             // 未提供 range 时回退
    endIndex?: number;               // 未提供 range 时回退
    excerpt?: string;                // 可选摘录
    governanceDomain?: string | string[]; // 可选治理域
    impactHint?: 'low' | 'medium' | 'high';
    range?: {                        // 可选精确定位
      start: { line: number; column: number; index: number };
      end: { line: number; column: number; index: number };
    };
  }>;
}
```

#### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scope` | object | No | Scope context for multi-tenant isolation |
| `scope.tenant_id` | string | No | Tenant identifier for isolation boundaries |
| `scope.project_id` | string | No | Project identifier within tenant |
| `scope.actor_id` | string | No | Actor ID for audit logging |
| `scope.mode` | enum | No | `'local'` for development, `'service'` for production |
| `project` | string | Yes | Project name identifier (1-128 chars) |
| `rootDir` | string | Yes | Absolute filesystem path to scan |
| `include` | string[] | No | Glob patterns (fast-glob syntax), default: `['**/*']` |
| `ignore` | string[] | No | Glob patterns to exclude |
| `includeStats` | boolean | No | Include `parseCache` in response (default: false) |
| `deterministic` | boolean | No | Produce deterministic output (default: true). When true: sorted keys, fixed epoch timestamp, truncated fingerprints |
| `contractArtifacts` | object[] | No | Optional contract/scheme findings input. Each entry is normalized into `findingSource='contract'` findings |

### Example Request

```json
{
  "scope": {
    "tenant_id": "org_123",
    "project_id": "myapp",
    "actor_id": "user_456",
    "mode": "service"
  },
  "project": "myapp",
  "rootDir": "/workspace/myapp",
  "include": ["src/**/*.ts"],
  "ignore": ["**/*.spec.ts", "node_modules/**"],
  "includeStats": true
}
```

## Response Schema

### Success (200 OK)

```typescript
interface ScanResponse {
  data: {
    filesScanned: number;    // Total files processed
    findings: Finding[];     // Detected rule violations
    parseCache?: {           // Present if includeStats=true
      hits: number;          // Cache hit count
      misses: number;        // Cache miss count
      entries: number;       // Current cache entries
      maxEntries: number;    // Maximum cache capacity
    };
  };
}

interface Finding {
  tool: 'los-ast';                      // Tool identifier
  version: number;                      // Schema version (0)
  timestamp: string;                    // ISO 8601 timestamp
  project: string;                      // Project name
  ruleFile: string | null;              // Source rule file path
  ruleId: string;                       // Rule identifier
  severity: 'info' | 'warning' | 'error'; // Violation severity
  message: string;                      // Human-readable message
  file: string;                         // Absolute file path
  language: string;                     // Detected language
  range: {                              // Location in file
    start: { line: number; column: number; index: number };
    end: { line: number; column: number; index: number };
  };
  excerpt: string;                      // Code snippet (max 240 chars)
  hasFix: boolean;                      // Auto-fix available
  proposedReplacement: string | null;   // Suggested fix
  fingerprint: string;                  // SHA-256 hash for deduplication
  findingSource?: 'ast' | 'contract' | 'schema'; // Result source tag
  governanceDomain?: string[];          // 可选治理域标签: frontend/backend/database/interface/quality...
  impactHint?: 'low' | 'medium' | 'high'; // 可选风险提示
}
```

### Example Success Response

```json
{
  "data": {
    "filesScanned": 42,
    "findings": [
      {
        "tool": "los-ast",
        "version": 0,
        "timestamp": "2026-03-08T12:34:56.789Z",
        "project": "myapp",
        "ruleFile": "rules/languages/typescript/no-console.yml",
        "ruleId": "typescript/no-console",
        "severity": "warning",
        "message": "Unexpected console statement",
        "file": "/workspace/myapp/src/index.ts",
        "language": "typescript",
        "range": {
          "start": { "line": 10, "column": 0, "index": 245 },
          "end": { "line": 10, "column": 11, "index": 256 }
        },
        "excerpt": "console.log",
        "hasFix": false,
        "proposedReplacement": null,
        "fingerprint": "a1b2c3d4e5f6..."
      }
    ],
    "parseCache": {
      "hits": 15,
      "misses": 27,
      "entries": 27,
      "maxEntries": 100
    }
  }
}
```

## Error Responses

All errors follow the standardized error format wrapped in an `error` object:

```typescript
interface ErrorResponse {
  error: ApiError;
}

interface ApiError {
  category: ErrorCategory;
  code: string;
  message: string;
  requestId: string;
  timestamp: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

type ErrorCategory =
  | 'VALIDATION'      // Input validation failure
  | 'SCOPE'           // Scope/permission error
  | 'TIMEOUT'         // Request timeout
  | 'SCAN_TOO_LARGE'  // Response exceeds size limit
  | 'NOT_FOUND'       // Resource not found
  | 'SERVICE_UNAVAILABLE'; // Core not ready / explicit fallback
  | 'INTERNAL';       // Internal server error
```

### Error Code Reference

| HTTP Status | Category | Code | Description |
|-------------|----------|------|-------------|
| 400 | VALIDATION | `INVALID_PROJECT` | Project field missing or invalid |
| 400 | VALIDATION | `INVALID_ROOTDIR` | rootDir field missing or invalid |
| 413 | SCAN_TOO_LARGE | `SCAN_TOO_LARGE` | Response size exceeds limit |
| 503 | SERVICE_UNAVAILABLE | `CORE_NOT_READY` | Core is not ready, explicit fallback path |
| 403 | SCOPE | `SCOPE_ERROR` | Scope/permission issue |
| 404 | NOT_FOUND | `RESOURCE_NOT_FOUND` | Requested resource not found |
| 404 | NOT_FOUND | `ROUTE_NOT_FOUND` | API endpoint not found |
| 408 | TIMEOUT | `REQUEST_TIMEOUT` | Scan exceeded time limit |
| 500 | INTERNAL | `INTERNAL_ERROR` | Unexpected server error |
| 500 | INTERNAL | `UNKNOWN_ERROR` | Unknown error type |

### Readiness & Explicit Degradation Contract

对 `503 SERVICE_UNAVAILABLE + CORE_NOT_READY` 的重试与回退策略，请以  
[Service Readiness & Explicit Degradation Contract](../../../docs/service-readiness-degradation-contract.md) 为准。

### Example Error Response

```json
{
  "error": {
    "category": "VALIDATION",
    "code": "INVALID_PROJECT",
    "message": "project must be a non-empty string",
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2026-03-08T12:34:56.789Z",
    "retryable": false,
    "details": {}
  }
}
```

## Limits and Constraints

| Constraint | Value | Description |
|------------|-------|-------------|
| Max Files (Sync) | 1,000 | Maximum files per synchronous scan |
| Response Size | 10MB | Maximum JSON response size |
| Timeout | 30s | Maximum scan duration |
| Excerpt Length | 240 chars | Maximum finding excerpt length |
| Cache Entries | 100 | Maximum parse cache entries |

## Governance Scope Note (March 2026)

`/scan` 当前已补齐代码层扫描能力，并支持最小化 `contractArtifacts` 直通，默认输出的 `findingSource` 为 `ast`，并可与 `contract` findings 并行返回。  

| 维度 | 当前状态 | 说明 |
|------|----------|------|
| 前端/后端接口治理 | 代码层可扫描（如调用方式、错误处理、网络层封装） | 可通过规则包持续补齐 |
| 接口契约治理 | `contract` 域已支持最小接入 | 通过 `contractArtifacts` 字段输入轻量条目，后续将对接 OpenAPI/IDL/Schema 提取器 |
| 数据库字段治理 | `schema` 域未内置 | 需要 schema/DDL 侧解析与字段变更语义模型 |

`findingSource='contract'|'schema'` 是后续演进预留字段，与现有 `findingSource='ast'` 兼容。

## CLI/API Parity

The CLI `scan` command produces identical output structure to the API:

```bash
# CLI output (JSONL format)
los-ast scan --root /path --include "src/**/*.ts" --format jsonl
```

CLI options map to API fields:

| CLI Option | API Field | Notes |
|------------|-----------|-------|
| `--root <dir>` | `rootDir` | Resolved to absolute path |
| `--project <name>` | `project` | Defaults to 'custom' |
| `--include <glob>` | `include` | Array of glob patterns |
| `--ignore <glob>` | `ignore` | Array of glob patterns |
| `--rules <glob>` | `rules` | Rule file patterns (optional) |
| `--deterministic` | `deterministic` | Default: true for machine output |
| N/A | `scope` | CLI runs in local mode |

## Version Stability Guarantee

This v1 contract guarantees:

1. **Field Stability**: Required response fields will not be removed
2. **Type Stability**: Field types will not change in incompatible ways
3. **Error Stability**: Error codes remain constant
4. **Backward Compatibility**: New optional fields may be added

Deprecation policy: Fields may be deprecated with 6-month notice before removal in v2.

## Deterministic Output

When `deterministic: true` (default), the API produces byte-for-byte reproducible output:

| Aspect | Behavior |
|--------|----------|
| JSON Keys | Sorted alphabetically (deep sort) |
| Findings Order | Sorted by file path, then line, then column |
| Timestamp | Fixed to Unix epoch (`1970-01-01T00:00:00.000Z`) |
| Fingerprint | Truncated to 32 characters |
| Output | Identical across multiple runs with same input |

When `deterministic: false`, real-time timestamps and full 64-character fingerprints are used.

## Testing

Contract tests verify CLI/API parity:

```typescript
// tests/contract/cli-api-parity.test.ts
// Verifies identical output structure between CLI and API
```

Run contract tests:
```bash
npm run test:api:contract
```
