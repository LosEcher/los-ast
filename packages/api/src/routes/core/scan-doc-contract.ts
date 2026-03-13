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

export const SCAN_GOVERNANCE_OVERVIEW = {
  intro:
    '`/scan` 当前已补齐代码层扫描能力，并支持最小化 `contractArtifacts/schemaArtifacts` 直通，以及 `openApiDocuments/openApiComparisons/schemaDocuments/schemaComparisons` 的原生输入。默认输出的 `findingSource` 为 `ast`，并可与 `contract/schema` findings 并行返回。',
  rows: [
    {
      dimension: '前端/后端接口治理',
      status: '代码层可扫描（如调用方式、错误处理、网络层封装）',
      details: '可通过规则包持续补齐',
    },
    {
      dimension: '接口契约治理',
      status: '`contract` 域已支持最小接入',
      details:
        '支持 `contractArtifacts` 直通、`openApiDocuments` 原生输入和 `openApiComparisons` 最小兼容性对比；当前已支持本地 `$ref`、简单 `allOf`、`oneOf/anyOf` 公共字段归一（含 response 侧本地 ref 组合场景）、success response 按状态码对齐，以及 object 嵌套路径、`array.items` 路径和 `additionalProperties` map-like 路径的 request/response comparison；嵌套路径中的本地 `$ref`、简单 `allOf` 与 `oneOf` 数组项组合也已有回归覆盖，更完整的 OpenAPI/IDL/Schema 提取器仍在后续阶段',
    },
    {
      dimension: '字段治理',
      status: '`schema` 域已支持最小接入',
      details: '支持 `schemaArtifacts` 直通和 `schemaDocuments` 原生输入；当前先覆盖主键与敏感字段可空类问题',
    },
    {
      dimension: '兼容性治理',
      status: '`contract/schema` 域已支持最小对比',
      details:
        '`contract` 支持 `openApiComparisons` 的 operation 删除、请求字段删除/类型变化/必填新增、请求新增必填字段带 default 的降级提示、响应字段删除/类型变化、响应 required -> optional 变化、最小值语义 comparison（`nullable` 收紧、`enum` 值删除、`default` 删除/变更），以及最小 `discriminator` comparison（`propertyName` 变化、mapping 值删除）；`schema` 支持 `schemaComparisons` 的字段删除、类型变化、主键变化、字段/组合唯一键 drift、可空性收紧、新增必填字段无 default、带 default 的降级提示，以及最小 Prisma/SQL 默认值等价归一',
    },
    {
      dimension: '数据库字段治理',
      status: '`schema` 域未内置',
      details: '需要 schema/DDL 侧解析与字段变更语义模型',
    },
  ],
  findingSourceNote:
    "`findingSource='contract'|'schema'` 是后续演进预留字段，与现有 `findingSource='ast'` 兼容。",
  references: [
    'docs/api/ARTIFACT_PARSER_CAPABILITIES.md',
    'docs/rules/FINDING_ATTRIBUTION.md',
  ],
} as const;

export const SCAN_CLI_API_PARITY_REFERENCE = {
  intro: 'The CLI `scan` command produces identical output structure to the API:',
  exampleCommand: 'los-ast scan --root /path --include "src/**/*.ts" --format jsonl',
  mappings: [
    {
      cliOption: '`--root <dir>`',
      apiField: '`rootDir`',
      notes: 'Resolved to absolute path',
    },
    {
      cliOption: '`--project <name>`',
      apiField: '`project`',
      notes: "Defaults to `'custom'`",
    },
    {
      cliOption: '`--include <glob>`',
      apiField: '`include`',
      notes: 'Array of glob patterns',
    },
    {
      cliOption: '`--ignore <glob>`',
      apiField: '`ignore`',
      notes: 'Array of glob patterns',
    },
    {
      cliOption: '`--rules <glob>`',
      apiField: '`rules`',
      notes: 'Rule file patterns (optional addon patterns)',
    },
    {
      cliOption: '`--deterministic`',
      apiField: '`deterministic`',
      notes: 'CLI flag opt-in; API 默认为 false',
    },
    {
      cliOption: 'N/A',
      apiField: '`scope`',
      notes: 'CLI runs in local mode and does not wrap findings in a `data` envelope',
    },
  ],
} as const;

export const SCAN_VERSION_STABILITY_REFERENCE = {
  title: 'This v1 contract guarantees:',
  guarantees: [
    'Field Stability: required response fields will not be removed',
    'Type Stability: field types will not change in incompatible ways',
    'Error Stability: error codes remain constant',
    'Backward Compatibility: new optional fields may be added',
  ],
  deprecationPolicy:
    'Fields may be deprecated with 6-month notice before removal in v2.',
} as const;

export const SCAN_DETERMINISTIC_REFERENCE = {
  intro: 'When `deterministic: true`, the API produces byte-for-byte reproducible output:',
  rows: [
    {
      aspect: 'JSON Keys',
      behavior: 'Sorted alphabetically (deep sort)',
    },
    {
      aspect: 'Findings Order',
      behavior: 'Sorted by file path, then line, then column',
    },
    {
      aspect: 'Timestamp',
      behavior: 'Fixed to Unix epoch (`1970-01-01T00:00:00.000Z`)',
    },
    {
      aspect: 'Fingerprint',
      behavior: 'Truncated to 32 characters',
    },
    {
      aspect: 'Output',
      behavior: 'Identical across multiple runs with same input',
    },
  ],
  nondeterministicNote:
    'When `deterministic: false`, real-time timestamps and full 64-character fingerprints are used.',
} as const;

export const SCAN_TESTING_REFERENCE = {
  intro: 'Contract tests verify CLI/API parity:',
  snippet: [
    '// tests/contract/cli-api-parity.test.ts',
    '// Verifies identical output structure between CLI and API',
  ],
  command: 'npm run test:api:contract',
} as const;

export const SCAN_OPENAPI_OPERATION_SUMMARY = '执行代码扫描';

export const SCAN_OPENAPI_CANCELLATION_SEMANTICS = [
  'Client Disconnect: HTTP 连接断开时扫描终止',
  'Server Timeout: 超过 `maxDurationMs` 返回 408',
] as const;

export const SCAN_OPENAPI_SCOPE_REQUIREMENTS = [
  '生产环境：必须提供完整的 `tenant_id`, `project_id`, `actor_id`',
  "生产环境：`mode: 'local'` 会被拒绝（403）",
  "开发环境：允许 `mode: 'local'` 简化调试",
] as const;

export const SCAN_OPENAPI_REQUEST_EXAMPLES = {
  minimal: {
    summary: '最小请求',
    value: {
      scope: {
        tenant_id: 'tenant-001',
        project_id: 'project-001',
        actor_id: 'actor-001',
      },
      project: 'my-project',
      rootDir: '/path/to/code',
    },
  },
  withOptions: {
    summary: '完整选项',
    value: {
      scope: {
        tenant_id: 'org_123',
        project_id: 'myapp',
        actor_id: 'user_456',
        mode: 'service',
      },
      project: 'myapp',
      rootDir: '/workspace/myapp',
      include: ['src/**/*.ts'],
      ignore: ['**/*.spec.ts', 'node_modules/**'],
      includeStats: true,
      deterministic: true,
    },
  },
  withSchemaArtifacts: {
    summary: '合并数据库 Schema Findings',
    value: {
      scope: {
        tenant_id: 'tenant-001',
        project_id: 'project-001',
        actor_id: 'actor-001',
        mode: 'service',
      },
      project: 'my-project',
      rootDir: '/path/to/code',
      schemaArtifacts: [
        {
          source: 'schema/user-db.sql',
          ruleId: 'schema/user-email-nullability',
          severity: 'warning',
          message: '字段 email 未限制为非空',
          file: 'schema/users.sql',
          line: 17,
          column: 4,
          governanceDomain: 'database',
          impactHint: 'medium',
        },
      ],
    },
  },
} as const;

export const SCAN_OPENAPI_ERROR_RESPONSES = {
  '400': {
    description: '请求参数错误',
    examples: {
      validation: {
        summary: '参数验证失败',
        value: {
          error: {
            category: 'VALIDATION',
            code: 'INVALID_PROJECT',
            message: 'project must be a non-empty string',
            requestId: 'req-123',
            timestamp: '2026-03-07T12:00:00.000Z',
            retryable: false,
          },
        },
      },
    },
  },
  '403': {
    description: '生产环境拒绝 local 模式',
    examples: {
      localForbidden: {
        summary: 'Local 模式被禁止',
        value: {
          error: {
            category: 'SCOPE',
            code: 'LOCAL_SCOPE_FORBIDDEN',
            message: 'scope.mode=local is not allowed in production',
            requestId: 'req-123',
            timestamp: '2026-03-07T12:00:00.000Z',
            retryable: false,
          },
        },
      },
    },
  },
  '401': {
    description: '身份验证失败',
    examples: {
      missingJwt: {
        summary: '缺少 JWT',
        value: {
          error: {
            category: 'AUTHENTICATION',
            code: 'MISSING_JWT',
            message: 'JWT token is required in production environment',
            requestId: 'req-123',
            timestamp: '2026-03-07T12:00:00.000Z',
            retryable: false,
          },
        },
      },
    },
  },
  '408': {
    description: '扫描超时',
    examples: {
      timeout: {
        summary: '扫描超时',
        value: {
          error: {
            category: 'TIMEOUT',
            code: 'REQUEST_TIMEOUT',
            message: 'Operation exceeded 30000ms limit',
            requestId: 'req-123',
            timestamp: '2026-03-07T12:00:00.000Z',
            retryable: true,
          },
        },
      },
    },
  },
  '413': {
    description: '扫描结果过大',
    examples: {
      tooLarge: {
        summary: '响应过大',
        value: {
          error: {
            category: 'SCAN_TOO_LARGE',
            code: 'SCAN_TOO_LARGE',
            message: 'Estimated 1524 files exceeds limit 1000. Use smaller include patterns or async task mode.',
            requestId: 'req-123',
            timestamp: '2026-03-07T12:00:00.000Z',
            retryable: false,
            details: {
              limit: 1000,
              estimated: 1524,
            },
          },
        },
      },
    },
  },
  '503': {
    description: 'Core 未就绪（显式降级）',
    examples: {
      coreNotReady: {
        summary: 'Core not ready',
        value: {
          error: {
            category: 'SERVICE_UNAVAILABLE',
            code: 'CORE_NOT_READY',
            message: 'Core is not ready',
            requestId: 'req-123',
            timestamp: '2026-03-07T12:00:00.000Z',
            retryable: true,
            details: {
              reason: 'core_not_ready',
            },
          },
        },
      },
    },
  },
} as const;
