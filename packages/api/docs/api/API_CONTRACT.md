# los-ast Scan API v1 Contract

**Version:** 1.0.0
**Stability:** Stable (frozen for remote evidence interface)
**Last Updated:** 2026-03-12

## Overview

This document defines the stable API contract for the los-ast scan endpoint. The `/scan` endpoint provides synchronous code analysis with rule-based pattern matching. This contract is frozen and guaranteed to remain backward-compatible for the v1 lifecycle.

## Endpoint

```
POST /scan
```

## Request Schema

> Source of truth note:
> `/scan` request/response字段的代码真源当前以 [packages/api/src/routes/core/scan-contract.ts](/Users/echerlos/Downloads/projects/los-ast/packages/api/src/routes/core/scan-contract.ts)、
> [packages/api/src/routes/core/scan-schema.ts](/Users/echerlos/Downloads/projects/los-ast/packages/api/src/routes/core/scan-schema.ts)、
> [packages/shared/src/types/api.ts](/Users/echerlos/Downloads/projects/los-ast/packages/shared/src/types/api.ts) 为准。
> 本文档保留对外契约说明，但不再作为新增字段的首个定义来源。
> 机器可读参考产物见 [scan-contract-reference.json](/Users/echerlos/Downloads/projects/los-ast/packages/api/docs/api/generated/scan-contract-reference.json)。
> OpenAPI 生成片段见 [scan-openapi-components.yaml](/Users/echerlos/Downloads/projects/los-ast/docs/api/generated/scan-openapi-components.yaml)。
> API_CONTRACT 生成片段见 [scan-api-contract-sections.md](/Users/echerlos/Downloads/projects/los-ast/packages/api/docs/api/generated/scan-api-contract-sections.md)。

### Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes | Must be `application/json` |
| `X-Request-ID` | No | Client-provided request identifier (UUID v4 recommended) |

<!-- @generated scan-api-contract:begin -->
### Body

```typescript
interface ScanRequest {
  scope?: Scope;
  project: string;
  rootDir?: string;
  include?: string[];
  ignore?: string[];
  rules?: string[];
  rulePack?: string;
  includeStats?: boolean;
  deterministic?: boolean;
  openApiDocuments?: unknown[];
  openApiComparisons?: unknown[];
  schemaDocuments?: unknown[];
  schemaComparisons?: unknown[];
  contractArtifacts?: unknown[];
  schemaArtifacts?: unknown[];
}
```

#### Field Descriptions

| Field | Required | Notes |
|-------|----------|-------|
| `scope` | No | Compatibility context object; production identity should be derived from verified auth, not trusted as the sole source |
| `project` | Yes | Stable request identifier for the scan target |
| `rootDir` | Conditional | Required only when the request implies AST/code scanning; native-only inputs may omit it |
| `include` | No | Optional scan request field |
| `ignore` | No | Optional scan request field |
| `rules` | No | Optional scan request field |
| `rulePack` | No | Optional scan request field |
| `includeStats` | No | Enables `parseCache`, `parseFailures`, and `scanTelemetry` in the response |
| `deterministic` | No | Optional stable output mode; current default is `false` |
| `openApiDocuments` | No | Native governance input channel; may be supplied without `rootDir` |
| `openApiComparisons` | No | Native governance input channel; may be supplied without `rootDir` |
| `schemaDocuments` | No | Native governance input channel; may be supplied without `rootDir` |
| `schemaComparisons` | No | Native governance input channel; may be supplied without `rootDir` |
| `contractArtifacts` | No | Native governance input channel; may be supplied without `rootDir` |
| `schemaArtifacts` | No | Native governance input channel; may be supplied without `rootDir` |

When `rootDir` is omitted, the request must provide at least one native input set: `openApiDocuments`, `openApiComparisons`, `schemaDocuments`, `schemaComparisons`, `contractArtifacts`, `schemaArtifacts`.

## Response Schema

### Success (200 OK)

```typescript
interface ScanResponse {
  data: {
    filesScanned: number;
    findings: Finding[];
    parseCache?: unknown;
    parseFailures?: unknown;
    scanTelemetry?: unknown;
  };
}
```

Current `data` properties:

- `filesScanned`
- `findings`
- `parseCache`
- `parseFailures`
- `scanTelemetry`
<!-- @generated scan-api-contract:end -->

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
| `--deterministic` | `deterministic` | CLI flag opt-in; API 默认为 false |
| N/A | `scope` | CLI runs in local mode |

## Version Stability Guarantee

This v1 contract guarantees:

1. **Field Stability**: Required response fields will not be removed
2. **Type Stability**: Field types will not change in incompatible ways
3. **Error Stability**: Error codes remain constant
4. **Backward Compatibility**: New optional fields may be added

Deprecation policy: Fields may be deprecated with 6-month notice before removal in v2.

## Deterministic Output

When `deterministic: true`, the API produces byte-for-byte reproducible output:

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
