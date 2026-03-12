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
  rootDir?: string;        // Required for AST/code scanning; optional for native-only contract/schema inputs
  include?: string[];      // Glob patterns for file inclusion
  ignore?: string[];       // Glob patterns for file exclusion
  rules?: string[];        // Rule file glob patterns (default: auto-resolve)
  includeStats?: boolean;  // Include parse cache/failure statistics
  deterministic?: boolean; // Default: true (stable sorting, fixed timestamps)
  openApiDocuments?: Array<{
    source?: string;                 // 来源标签
    file?: string;                   // 逻辑文件名
    content: string;                 // OpenAPI YAML/JSON 文本
    format?: 'yaml' | 'json';        // 可选格式提示
  }>;
  openApiComparisons?: Array<{
    source?: string;                 // 来源标签
    file?: string;                   // 逻辑文件名
    baseline: string;                // 基线 OpenAPI YAML/JSON 文本
    current: string;                 // 当前 OpenAPI YAML/JSON 文本
    format?: 'yaml' | 'json';        // 可选格式提示
  }>;
  schemaDocuments?: Array<{
    source?: string;                 // 来源标签
    file?: string;                   // 逻辑文件名
    content: string;                 // SQL/Prisma 文本
    format?: 'sql' | 'prisma';       // 可选格式提示
  }>;
  schemaComparisons?: Array<{
    source?: string;                 // 来源标签
    file?: string;                   // 逻辑文件名
    baseline: string;                // 基线 SQL/Prisma 文本
    current: string;                 // 当前 SQL/Prisma 文本
    format?: 'sql' | 'prisma';       // 可选格式提示
  }>;
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
| `rootDir` | string | Conditional | Required for AST/code scanning. Optional when the request only contains native contract/schema inputs |
| `include` | string[] | No | Glob patterns (fast-glob syntax), default: `['**/*']` |
| `ignore` | string[] | No | Glob patterns to exclude |
| `includeStats` | boolean | No | Include parse statistics in response (`parseCache` / `parseFailures` / `scanTelemetry`, default: false). Native-only requests may set this without providing `rootDir` |
| `deterministic` | boolean | No | Produce deterministic output (default: true). When true: sorted keys, fixed epoch timestamp, truncated fingerprints |
| `openApiDocuments` | object[] | No | Optional native OpenAPI inputs. Each document is parsed into `findingSource='contract'` findings before merge |
| `openApiComparisons` | object[] | No | Optional baseline/current OpenAPI comparisons. Each pair is parsed into `findingSource='contract'` compatibility findings before merge |
| `schemaDocuments` | object[] | No | Optional native SQL/Prisma inputs. Each document is parsed into `findingSource='schema'` findings before merge |
| `schemaComparisons` | object[] | No | Optional baseline/current schema comparisons. Each pair is parsed into `findingSource='schema'` breaking-risk findings before merge |
| `contractArtifacts` | object[] | No | Optional contract/scheme findings input. Each entry is normalized into `findingSource='contract'` findings |

When `rootDir` is omitted, the request must provide at least one native input set: `openApiDocuments`, `openApiComparisons`, `schemaDocuments`, `schemaComparisons`, `contractArtifacts`, or `schemaArtifacts`. Native-only requests skip repository scanning and return `filesScanned: 0`; `includeStats=true` only affects emitted stats and does not force AST scanning.

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
    parseFailures?: {        // Present if includeStats=true and some files failed to parse
      count: number;         // Total parse failures
      sampleLimit: number;   // Maximum number of samples returned
      truncated: boolean;    // Whether additional samples were omitted
      byLanguage: Record<string, number>; // Aggregated parse failures by language
      samples: Array<{
        file: string;        // Failed file path
        language: string;    // Parser language label
        error: string;       // Parser error message
      }>;
    };
    scanTelemetry?: {        // Present if includeStats=true
      durationMs: number;    // End-to-end scan service duration
      mode: 'ast' | 'native_only' | 'hybrid';
      explicitRulePatterns: number;
      loadedRules: number;
      estimatedFiles?: number;
      nativeInputs: {
        openApiDocuments: number;
        openApiComparisons: number;
        schemaDocuments: number;
        schemaComparisons: number;
        contractArtifacts: number;
        schemaArtifacts: number;
      };
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
  governanceDomain?: string[] | null;   // 可选治理域标签；未命中治理元信息时可能为 null
  impactHint?: 'low' | 'medium' | 'high' | null; // 可选风险提示；未命中治理元信息时可能为 null
  diff?: string | null;                 // Applied fix diff when present
  applied?: boolean;                    // Whether a fix was written
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
    },
    "parseFailures": {
      "count": 1,
      "sampleLimit": 20,
      "truncated": false,
      "byLanguage": {
        "JavaScript": 1
      },
      "samples": [
        {
          "file": "/workspace/myapp/src/broken.js",
          "language": "JavaScript",
          "error": "Unexpected token"
        }
      ]
    },
    "scanTelemetry": {
      "durationMs": 37,
      "mode": "ast",
      "explicitRulePatterns": 1,
      "loadedRules": 12,
      "estimatedFiles": 42,
      "nativeInputs": {
        "openApiDocuments": 0,
        "openApiComparisons": 0,
        "schemaDocuments": 0,
        "schemaComparisons": 0,
        "contractArtifacts": 0,
        "schemaArtifacts": 0
      }
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
| 400 | VALIDATION | `INVALID_SCAN_INPUT` | Neither `rootDir` nor any native contract/schema input set was provided |
| 400 | VALIDATION | `INVALID_ROOTDIR` | rootDir field missing or invalid when the request implies AST/code scanning |
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

`/scan` 当前已补齐代码层扫描能力，并支持最小化 `contractArtifacts/schemaArtifacts` 直通，以及 `openApiDocuments/openApiComparisons/schemaDocuments/schemaComparisons` 的原生输入。默认输出的 `findingSource` 为 `ast`，并可与 `contract/schema` findings 并行返回。  

| 维度 | 当前状态 | 说明 |
|------|----------|------|
| 前端/后端接口治理 | 代码层可扫描（如调用方式、错误处理、网络层封装） | 可通过规则包持续补齐 |
| 接口契约治理 | `contract` 域已支持最小接入 | 支持 `contractArtifacts` 直通、`openApiDocuments` 原生输入和 `openApiComparisons` 最小兼容性对比；当前已支持本地 `$ref`、简单 `allOf`、`oneOf/anyOf` 公共字段归一（含 response 侧本地 ref 组合场景）、success response 按状态码对齐，以及 object 嵌套路径、`array.items` 路径和 `additionalProperties` map-like 路径的 request/response comparison；嵌套路径中的本地 `$ref`、简单 `allOf` 与 `oneOf` 数组项组合也已有回归覆盖，更完整的 OpenAPI/IDL/Schema 提取器仍在后续阶段 |
| 字段治理 | `schema` 域已支持最小接入 | 支持 `schemaArtifacts` 直通和 `schemaDocuments` 原生输入；当前先覆盖主键与敏感字段可空类问题 |
| 兼容性治理 | `contract/schema` 域已支持最小对比 | `contract` 支持 `openApiComparisons` 的 operation 删除、请求字段删除/类型变化/必填新增、请求新增必填字段带 default 的降级提示、响应字段删除/类型变化、响应 required -> optional 变化、最小值语义 comparison（`nullable` 收紧、`enum` 值删除、`default` 删除/变更），以及最小 `discriminator` comparison（`propertyName` 变化、mapping 值删除）；`schema` 支持 `schemaComparisons` 的字段删除、类型变化、主键变化、字段/组合唯一键 drift、可空性收紧、新增必填字段无 default、带 default 的降级提示，以及最小 Prisma/SQL 默认值等价归一 |
| 数据库字段治理 | `schema` 域未内置 | 需要 schema/DDL 侧解析与字段变更语义模型 |

`findingSource='contract'|'schema'` 是后续演进预留字段，与现有 `findingSource='ast'` 兼容。

更多 parser 能力边界与发布说明见：

- `docs/api/ARTIFACT_PARSER_CAPABILITIES.md`
- `docs/rules/FINDING_ATTRIBUTION.md`

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
