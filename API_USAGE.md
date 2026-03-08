# los-ast API 使用指南

**版本**: 1.0.0
**基础路径**: `http://localhost:3000`
**协议**: HTTP/REST + JSON

---

## 路由层级说明

los-ast API 采用四层路由架构，区分不同稳定性的端点：

| 层级 | 路由前缀 | 默认状态 | 稳定性 | 说明 |
|------|----------|----------|--------|------|
| **Core** | `/` | 始终启用 | 稳定 | P0 核心功能，保证向后兼容 |
| **Experimental** | `/experimental` | 默认关闭 | 不稳定 | Phase 1.x 功能，可能变更 |
| **Internal** | `/internal` | 默认关闭 | 内部使用 | 开发/调试用途 |
| **VPS Agent Web** | `/vps-agent-web` | 默认关闭 | beta/preview | 外部联调稳定前缀封装 |

### 启用实验性路由

实验性路由默认关闭，需通过环境变量启用：

```bash
# 方式1: 命令行
ENABLE_EXPERIMENTAL_ROUTES=true npm run dev

# 方式2: .env 文件
echo "ENABLE_EXPERIMENTAL_ROUTES=true" >> .env
```

> **警告**: 实验性路由的 API 契约可能变更，不建议生产环境依赖。

### 启用 VPS Agent Web 路由

```bash
ENABLE_VPS_AGENT_WEB_ROUTES=true npm run dev
```

---

## 快速开始

### 1. 启动服务

```bash
cd packages/api
npm install
npm run dev
```

服务将在 `http://localhost:3000` 启动。

### 2. 健康检查

```bash
curl http://localhost:3000/healthz/live
curl http://localhost:3000/healthz/ready
```

---

## API 端点

### 核心端点 (Core Layer)

P0 核心功能，始终启用，保证向后兼容。

#### `GET /healthz/live` [稳定]

存活检查，返回服务是否运行。

**响应**:
```json
{
  "status": "alive",
  "timestamp": "2026-03-07T12:00:00.000Z"
}
```

#### `GET /healthz/ready` [稳定]

就绪检查，返回服务及依赖状态。

**响应**:
```json
{
  "status": "ready",
  "timestamp": "2026-03-07T12:00:00.000Z"
}
```

#### `POST /scan` [稳定]

扫描代码项目并返回发现的问题。

**请求头**:
```
Content-Type: application/json
X-Request-ID: <可选，自动生成为UUID>
```

**请求体**:
```json
{
  "scope": {
    "tenant_id": "tenant-001",
    "project_id": "proj-001",
    "actor_id": "user-001",
    "mode": "service"
  },
  "project": "my-project",
  "rootDir": "/path/to/code",
  "include": ["**/*.ts", "**/*.tsx"],
  "ignore": ["node_modules", "dist"],
  "includeStats": true
}
```

**字段说明**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `scope` | object | 是 | 请求作用域 |
| `scope.tenant_id` | string | 条件 | 租户ID (REQUIRE_FULL_SCOPE=true时必填) |
| `scope.project_id` | string | 条件 | 项目ID (REQUIRE_FULL_SCOPE=true时必填) |
| `scope.actor_id` | string | 条件 | 执行者ID (REQUIRE_FULL_SCOPE=true时必填) |
| `scope.mode` | string | 否 | `local` 或 `service`，默认 `service` |
| `project` | string | 是 | 项目名称 |
| `rootDir` | string | 是 | 扫描根目录绝对路径 |
| `include` | string[] | 否 | 包含文件模式 (glob) |
| `ignore` | string[] | 否 | 排除文件模式 |
| `includeStats` | boolean | 否 | 是否包含解析缓存统计 |

**响应** (200 OK):
```json
{
  "data": {
    "filesScanned": 42,
    "findings": [
      {
        "tool": "los-ast",
        "version": 0,
        "timestamp": "2026-03-07T12:00:00.000Z",
        "project": "my-project",
        "ruleFile": "rulesets/recommended.json",
        "ruleId": "no-console",
        "severity": "warning",
        "message": "Unexpected console statement",
        "file": "src/index.ts",
        "language": "typescript",
        "range": {
          "start": { "line": 10, "column": 0, "index": 200 },
          "end": { "line": 10, "column": 15, "index": 215 }
        },
        "excerpt": "console.log('debug')",
        "hasFix": true,
        "proposedReplacement": "",
        "fingerprint": "sha256-hash"
      }
    ],
    "parseCache": {
      "hits": 35,
      "misses": 7,
      "entries": 42,
      "maxEntries": 128
    }
  }
}
```

**错误响应**:

| 状态码 | 错误类型 | 说明 |
|--------|----------|------|
| 400 | VALIDATION | 请求参数验证失败 |
| 403 | SCOPE | Scope 验证失败 |
| 408 | TIMEOUT | 扫描超时或被取消 |
| 413 | SCAN_TOO_LARGE | 扫描结果超过大小限制 |

#### `POST /discover/symbols` [稳定]

发现代码中的符号（函数、类、接口等）。

**请求体**:
```json
{
  "scope": {
    "tenant_id": "tenant-001",
    "project_id": "proj-001"
  },
  "rootDir": "/path/to/code",
  "include": ["**/*.ts"],
  "ignore": ["**/*.test.ts"],
  "limit": 1000
}
```

**响应** (200 OK):
```json
{
  "data": {
    "symbols": [
      {
        "name": "calculateTotal",
        "kind": "function",
        "file": "src/utils.ts",
        "range": {
          "start": { "line": 5, "column": 0, "index": 100 },
          "end": { "line": 20, "column": 1, "index": 450 }
        }
      }
    ],
    "total": 156,
    "truncated": false
  }
}
```

---

### 实验性端点 (Phase 1.x)

> **警告**: 以下端点挂载在 `/experimental/*` 前缀下，默认关闭。
> API 可能变更，不保证向后兼容。建议仅在开发环境使用。

| 端点 | 方法 | 说明 | 迁移计划 |
|------|------|------|----------|
| `/experimental/incidents` | POST/GET | 事件追踪 | Milestone B+ → VPS Agent Web |
| `/experimental/memory-proposals` | POST/GET | 向 los-memory 提议候选 | Milestone B → los-memory |
| `/experimental/attribution` | POST/GET/PATCH | 归因分析与假设管理 | Milestone B+ → VPS Agent Web |
| `/experimental/recovery` | POST/GET | 故障恢复与策略查询 | Milestone B+ → VPS Agent Web |
| `/experimental/approvals` | POST/GET | 高风险操作审批 | Milestone B+ → VPS Agent Web |
| `/experimental/hotreload` | POST/GET | 规则热重载 | 保留在 los-ast |
| `/experimental/evidence` | POST/GET | 证据生成 | 保留在 los-ast |

**启用方法**:
```bash
ENABLE_EXPERIMENTAL_ROUTES=true npm run dev
```

---

## 错误处理

### 错误响应格式

所有错误响应使用统一格式：

```json
{
  "error": {
    "category": "VALIDATION",
    "code": "MISSING_SCOPE_TENANT",
    "message": "Scope validation failed: tenant_id is required",
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2026-03-07T12:00:00.000Z",
    "retryable": false,
    "details": {
      "field": "scope.tenant_id"
    }
  }
}
```

### 错误类别

| 类别 | HTTP状态码 | 说明 | 可重试 |
|------|------------|------|--------|
| `VALIDATION` | 400 | 请求参数验证失败 | 否 |
| `SCOPE` | 403 | Scope 验证失败 | 否 |
| `TIMEOUT` | 408 | 请求超时 | 是 |
| `SCAN_TOO_LARGE` | 413 | 扫描结果过大 | 否 |
| `NOT_FOUND` | 404 | 资源不存在 | 否 |
| `INTERNAL` | 500 | 内部错误 | 是 |

---

## 取消语义 (Cancellation)

支持通过 AbortSignal 取消长时间运行的扫描：

```typescript
const controller = new AbortController();

// 5秒后自动取消
setTimeout(() => controller.abort(), 5000);

const response = await fetch('http://localhost:3000/scan', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(scanParams),
  signal: controller.signal,
});
```

取消后返回 408 状态码：
```json
{
  "error": {
    "category": "TIMEOUT",
    "code": "CANCELLED",
    "message": "Scan cancelled by client",
    "requestId": "xxx",
    "timestamp": "xxx",
    "retryable": true
  }
}
```

---

## TypeScript 类型

从共享包导入类型：

```typescript
import type {
  Scope,
  ScanParams,
  ScanResult,
  Finding,
  DiscoverParams,
  SymbolResult,
  ApiError,
  HealthStatus,
} from '@los-ast/shared/types';
```

---

## 客户端示例

### Node.js (Fetch)

```typescript
import type { ScanParams, ScanResult } from '@los-ast/shared/types';

async function scanProject(rootDir: string): Promise<ScanResult> {
  const params: ScanParams = {
    scope: {
      tenant_id: 'my-tenant',
      project_id: 'my-project',
      actor_id: 'cli-user',
      mode: 'service',
    },
    project: 'my-project',
    rootDir,
    include: ['**/*.ts'],
    ignore: ['node_modules/**'],
  };

  const response = await fetch('http://localhost:3000/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Scan failed: ${error.error.message}`);
  }

  const { data } = await response.json();
  return data;
}
```

### cURL

```bash
# 扫描项目
curl -X POST http://localhost:3000/scan \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: $(uuidgen)" \
  -d '{
    "scope": {
      "tenant_id": "test",
      "project_id": "demo",
      "actor_id": "cli"
    },
    "project": "demo",
    "rootDir": "'$(pwd)'/fixtures/sample-project",
    "include": ["**/*.ts", "**/*.tsx"],
    "ignore": ["node_modules"]
  }'

# 发现符号
curl -X POST http://localhost:3000/discover/symbols \
  -H "Content-Type: application/json" \
  -d '{
    "scope": { "tenant_id": "test" },
    "rootDir": "'$(pwd)'/src",
    "limit": 100
  }'
```

---

## 集成建议

### 与 lsclaw 集成

los-ast 可作为 lsclaw 的代码分析后端：

```typescript
// lsclaw 配置示例
const losAstConfig = {
  baseUrl: process.env.LOS_AST_URL || 'http://localhost:3000',
  scope: {
    tenant_id: process.env.LSCLAW_TENANT_ID,
    project_id: process.env.LSCLAW_PROJECT_ID,
    actor_id: 'lsclaw-agent',
    mode: 'service',
  },
  limits: {
    maxFiles: 1000,
    maxBytes: 10 * 1024 * 1024,
    maxDuration: 30000,
  },
};

// 调用扫描
async function analyzeCode(rootDir: string) {
  const response = await fetch(`${losAstConfig.baseUrl}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scope: losAstConfig.scope,
      project: 'lsclaw-analysis',
      rootDir,
    }),
  });
  return response.json();
}
```

建议在集成流水线增加 smoke 校验：

```bash
npm run test:api:smoke
```

---

## 限流与配额

| 限制项 | 默认值 | 说明 |
|--------|--------|------|
| 最大文件数 | 1000 | 单次扫描最多文件数 |
| 最大响应大小 | 10MB | 响应体大小限制 |
| 最大扫描时间 | 30秒 | 扫描超时时间 |
| 并发请求 | 无限制 | 当前版本未限制 |

---

## 更多信息

- [路由分层策略](docs/ROUTE_TIERING.md) - 详细的四层路由架构设计
- [架构设计文档](docs/implementation-roadmap-v1.1.md)
- [实现审查报告](docs/IMPLEMENTATION_REVIEW.md)
- [代码审查报告](docs/CODE_REVIEW.md)
- [验收检查报告](docs/ACCEPTANCE_REPORT.md)
