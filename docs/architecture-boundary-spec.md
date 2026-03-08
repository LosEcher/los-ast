# 四项目架构边界说明书

| 元数据 | 值 |
|--------|-----|
| **版本** | 1.3.0 |
| **状态** | draft / reviewed |
| **更新日期** | 2026-03-07 |
| **所有者** | los-ast 团队, lsclaw 团队 |
| **评审者** | 系统架构师、后端工程师、DevOps工程师 |
| **替代版本** | v1.1, v1.2 |

---

## 适用范围

本说明书用于定义以下 4 个项目的职责边界、所有权、依赖方向、接口协作方式与禁止越界规则：

- `los-ast`（本项目）
- `los-memory`
- `lsclaw`
- `VPS Agent Web`

## 目标

1. 保持各项目可独立使用、独立演进、独立部署
2. 保证项目间协作顺畅，但不形成循环依赖
3. 防止职责漂移、接口污染、状态重复持有
4. 为后续 API 设计、事件设计、监控设计提供统一依据

---

## 1. 总体架构原则

### 1.1 分层原则

四个项目按职责分为三层：

```
┌─────────────────────────────────────────────────────────────┐
│                    上层控制与执行层                           │
│              VPS Agent Web (Execution Fabric)               │
│     用户入口、任务编排、审批审计、执行控制面、追踪展示           │
├─────────────────────────────────────────────────────────────┤
│                    中间治理层                                 │
│              lsclaw (LLM Gateway / Governance)              │
│        LLM 路由、策略、治理、成本与风控、调用追踪标准化          │
├─────────────────────────────────────────────────────────────┤
│                    底层能力层                                 │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │    los-ast           │  │      los-memory              │ │
│  │  Code Intelligence   │  │   Project Memory /           │ │
│  │     Kernel           │  │  Corrected Facts Ledger      │ │
│  │ 代码理解与改写内核      │  │  长期知识沉淀、纠错记录、经验复用 │ │
│  └──────────────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 单向依赖原则

**允许的主要依赖方向：**

```
VPS Agent Web ────────▶ lsclaw
       │                    │
       ├────────────────────┘
       │
       ├──▶ los-ast
       │
       └──▶ los-memory

los-ast ──────────────▶ los-memory (只读查询，不直接写入)
```

**不允许的依赖方向：**

- `los-ast` → `VPS Agent Web` ❌
- `los-memory` → `VPS Agent Web` ❌
- `los-ast` → `lsclaw` ❌
- `los-memory` → `lsclaw` ❌
- `los-ast` ↔ `los-memory` 直接强耦合 ❌
- 任意项目反向依赖调用方内部状态 ❌

**一句话概括：**

> 上层编排下层，下层不感知上层。

### 1.3 所有权原则

边界不靠"感觉"定义，而靠以下三条定义：

1. **谁拥有核心长期状态**
2. **谁对该状态有最终写权限**
3. **谁是该对象的 Source of Truth**

如果一个项目只是消费结果，而不拥有该对象真相，它就不是该对象的归属方。

### 1.4 作用域与多租户约束（全局强约束）

**所有持久化对象与跨服务请求必须携带明确作用域（scope）**：

```typescript
interface RequestScope {
  tenant_id: string;      // 租户标识（多租户场景）
  project_id: string;     // 项目标识
  repo_id?: string;       // 仓库标识（如适用）
  actor_id: string;       // 操作者标识
  trace_id: string;       // 链路追踪标识
}
```

**强制规则**：

- ✅ scope 缺失的请求必须被拒绝处理
- ❌ 不允许默认使用"全局作用域"
- ✅ 缓存键必须包含 scope（防止跨租户污染）
- ✅ 所有对象查询必须按 scope 过滤
- ✅ 审计记录必须完整记录 scope

**示例违规**：

```typescript
// ❌ 错误：查询未限定 scope
const facts = await memory.query({ type: 'corrected_fact' });

// ✅ 正确：必须携带完整 scope
const facts = await memory.query({
  scope: { tenant_id, project_id },
  type: 'corrected_fact'
});
```

---

## 2. 项目定义

---

## 2.1 los-ast（本项目）

### 2.1.1 项目定位

`los-ast` 是 **Code Intelligence Kernel**。

负责将代码库转化为可查询、可验证、可改写的结构化表示，并对代码变更提供证据与影响面分析。

它回答的问题是：

- 代码结构是什么？
- 这次改动会影响哪里？
- 哪些位置满足某类规则？
- 如何基于结构安全地进行 rewrite？
- 哪些证据支持这次分析结论？

### 2.1.2 技术栈与实现现状

| 维度 | 当前实现 | 说明 |
|------|----------|------|
| **运行时** | Node.js 20+ | 基于 JavaScript/TypeScript |
| **AST 引擎** | ast-grep (tree-sitter) | 多语言解析支持 |
| **使用方式** | CLI + 库 | 当前为本地工具，未来可服务化 |
| **规则定义** | YAML | 声明式规则，支持 pattern/fix/constraints |
| **输出格式** | JSONL | 机读格式，便于 AI 消费 |
| **部署形态** | npm 包 / CLI | 可嵌入 CI/CD 或作为服务调用 |

### 2.1.3 核心职责

`los-ast` 负责：

- **代码解析**：基于 tree-sitter 的多语言 AST 解析
- **结构化提取**：文件、模块、符号、调用关系的提取
- **规则扫描**：基于 YAML 规则的代码模式匹配
- **影响面分析**：变更传播范围分析
- **批量改写**：安全地生成和应用代码变更
- **证据输出**：结构化证据与置信度
- **代码图谱**：增量式 CodeGraph 生成与更新

### 2.1.4 当前模块结构

```
los-ast/packages/
├── core/              # 执行引擎
│   ├── src/
│   │   ├── runner.mjs       # scan/fix/explain 核心逻辑
│   │   ├── rules.mjs        # 规则加载与验证
│   │   ├── parse-cache.mjs  # AST 解析缓存
│   │   ├── report.mjs       # 输出格式化
│   │   └── languages.mjs    # 语言注册
│   └── package.json
├── cli/               # 命令行入口
│   └── src/
│       └── index.mjs        # scan/fix/explain/doctor 命令
├── adapters/          # 项目适配器
│   └── src/
│       └── index.mjs        # cantool/lsclaw/fullstackframe 配置
├── rules/             # 规则加载支持
└── ai/                # AI 友好输出与模板
```

### 2.1.5 拥有对象

`los-ast` 拥有以下对象的最终真相：

| 对象 | 类型 | 说明 |
|------|------|------|
| `CodeGraph` | 图谱 | 代码结构图（文件-模块-符号关系） |
| `AstNodeIndex` | 索引 | AST 节点索引 |
| `SymbolIndex` | 索引 | 符号级索引 |
| `ReferenceGraph` | 图谱 | 调用/引用关系图 |
| `ImpactReport` | 报告 | 变更影响面分析报告 |
| `RewriteCandidate` | 候选 | 代码改写候选方案 |
| `EvidenceBundle` | 证据 | 分析证据集合 |
| `GraphDelta` | 差异 | 图谱变更差异 |
| `Finding` | 结果 | 规则匹配结果（JSONL 输出） |

**说明：**

- 这些对象的内部结构和生命周期由 `los-ast` 定义
- 其他系统只能读取、请求生成，不能直接修改其内部状态

### 2.1.6 不负责的内容

`los-ast` **明确不**负责：

- ❌ 长期记忆管理（归 `los-memory`）
- ❌ corrected facts 账本（归 `los-memory`）
- ❌ 任务调度与执行编排（归 `VPS Agent Web`）
- ❌ 审批流程（归 `VPS Agent Web`）
- ❌ 模型路由与选择（归 `lsclaw`）
- ❌ 成本治理（归 `lsclaw`）
- ❌ provider 策略（归 `lsclaw`）
- ❌ 用户会话管理（归 `VPS Agent Web`）
- ❌ dashboard 展示逻辑（归 `VPS Agent Web`）

### 2.1.7 对外接口类型（核心 API 契约）

推荐提供三类核心接口：

#### 1. discover - 发现代码结构事实

```typescript
// 发现符号
interface DiscoverSymbolsRequest {
  project: string;           // 项目标识
  rootDir: string;           // 代码根目录
  symbolPattern: string;     // 符号匹配模式
  language?: string;         // 语言过滤
  scope?: 'file' | 'module' | 'project';
}

interface DiscoverSymbolsResponse {
  symbols: Array<{
    id: string;
    name: string;
    kind: 'function' | 'class' | 'interface' | 'variable';
    file: string;
    range: { start: Position; end: Position };
    signature?: string;
  }>;
  evidence: EvidenceBundle;
}

// 发现调用方
interface DiscoverCallersRequest {
  project: string;
  targetSymbol: string;      // 目标符号
  file?: string;             // 限定文件范围
}

interface DiscoverCallersResponse {
  callers: Array<{
    symbol: string;
    file: string;
    range: Range;
    callSite: string;
  }>;
  evidence: EvidenceBundle;
}

// 发现租户边界（示例）
interface DiscoverTenantBoundariesRequest {
  project: string;
  tenantField: string;       // 如 "tenant_id"
}

interface DiscoverTenantBoundariesResponse {
  boundaries: Array<{
    module: string;
    isolationLevel: 'strict' | 'partial' | 'none';
    evidence: EvidenceReference[];
  }>;
}
```

#### 2. validate - 验证结论是否被代码事实支持

```typescript
// 验证隔离是否实施
interface ValidateIsolationEnforcedRequest {
  project: string;
  targetModule: string;
  tenantField: string;
}

interface ValidateIsolationEnforcedResponse {
  enforced: boolean;
  confidence: number;        // 0-1
  violations: Array<{
    file: string;
    line: number;
    message: string;
    severity: 'error' | 'warning';
  }>;
  evidence: EvidenceBundle;
}

// 验证符号使用
interface ValidateSymbolUsageRequest {
  project: string;
  symbol: string;
  expectedUsage: 'read' | 'write' | 'call';
}

// 验证 patch 安全性
interface ValidatePatchSafetyRequest {
  project: string;
  originalFile: string;
  proposedPatch: string;
  contextLines?: number;
}

interface ValidatePatchSafetyResponse {
  safe: boolean;
  conflicts: Array<{
    type: 'overlap' | 'syntax' | 'semantic';
    message: string;
    location?: Range;
  }>;
  impactEstimate: {
    filesAffected: number;
    symbolsAffected: number;
  };
}
```

#### 3. enumerate - 枚举目标或证据

```typescript
// 枚举候选文件
interface EnumerateCandidateFilesRequest {
  project: string;
  criteria: {
    languages?: string[];
    patterns?: string[];     // glob 模式
    excludePatterns?: string[];
    minSize?: number;
    maxSize?: number;
  };
}

interface EnumerateCandidateFilesResponse {
  files: Array<{
    path: string;
    language: string;
    size: number;
    relevance: number;       // 与 criteria 匹配度
  }>;
  totalCount: number;
}

// 枚举不安全模式
interface EnumerateUnsafePatternsRequest {
  project: string;
  category?: 'security' | 'performance' | 'correctness';
  severity?: ('error' | 'warning' | 'info')[];
}

interface EnumerateUnsafePatternsResponse {
  patterns: Array<{
    ruleId: string;
    category: string;
    severity: string;
    message: string;
    matches: Array<{
      file: string;
      range: Range;
      excerpt: string;
    }>;
  }>;
}

// 枚举受影响模块
interface EnumerateImpactedModulesRequest {
  project: string;
  changeSet: Array<{
    file: string;
    range: Range;
  }>;
}

interface EnumerateImpactedModulesResponse {
  modules: Array<{
    name: string;
    impactLevel: 'direct' | 'transitive' | 'potential';
    entryPoints: string[];
    evidence: EvidenceReference[];
  }>;
}

// 生成改写候选（中性命名，不暗示"修复完成"）
interface GenerateRewriteCandidateRequest {
  project: string;
  findings: Array<{
    fingerprint: string;
    approved: boolean;
    customReplacement?: string;  // 覆盖默认替换
  }>;
  options?: {
    dryRun: boolean;             // true: 只生成 candidate，不应用
    maxCandidates: number;       // 最大生成数量
    safetyLevel: 'strict' | 'lenient';  // 安全检查严格度
  };
}

interface GenerateRewriteCandidateResponse {
  candidates: Array<{
    fingerprint: string;
    file: string;
    range: Range;
    original: string;
    proposed: string;
    diff: string;
    safety: {
      syntaxValid: boolean;
      semanticValid: boolean;
      conflicts: Conflict[];
      confidence: number;
    };
    status: 'pending' | 'ready' | 'blocked';
  }>;
  summary: {
    total: number;
    ready: number;
    blocked: number;
    estimatedImpact: {
      filesAffected: number;
      linesChanged: number;
    };
  };
  evidence: EvidenceBundle;
}
```

### 2.1.8 输出约束

`los-ast` 输出必须结构化，当前 JSONL 格式包含：

```json
{
  "tool": "los-ast",
  "version": 0,
  "timestamp": "2024-01-15T09:30:00.000Z",
  "project": "cantool",
  "ruleFile": "rules/languages/rust/unsafe.yml",
  "ruleId": "RUST_UNSAFE_BLOCK",
  "severity": "warning",
  "message": "Found unsafe block",
  "file": "/path/to/file.rs",
  "language": "rust",
  "range": {
    "start": { "line": 10, "column": 4, "index": 245 },
    "end": { "line": 15, "column": 5, "index": 387 }
  },
  "excerpt": "unsafe { ... }",
  "hasFix": true,
  "proposedReplacement": "// TODO: review unsafe\nunsafe { ... }",
  "fingerprint": "sha256:abc123...",
  "diff": "...",              // fix 模式时包含
  "applied": false            // fix 模式时包含
}
```

**证据输出必须包含：**

- `object_id`：唯一标识
- `repo` / `revision`：代码版本
- `scope`：分析范围
- `evidence_references`：证据引用
- `confidence`：置信度（0-1）
- `generated_at`：生成时间
- `schema_version`：Schema 版本

### 2.1.9 错误处理公共规范（全文强制）

**所有 API 必须返回统一的错误结构**：

```typescript
interface ErrorResponse {
  error: {
    category: ErrorCategory;     // 错误分类
    code: string;                // 机器可读错误码
    message: string;             // 人类可读描述
    request_id: string;          // 链路追踪 ID
    trace_id?: string;           // OpenTelemetry trace ID
    timestamp: string;           // ISO 8601 时间戳
    retryable: boolean;          // 是否可重试
    details?: {
      field?: string;            // 验证错误字段
      suggestion?: string;       // 修复建议
      retry_after?: number;      // 限流时重试秒数
      similar_symbols?: string[];// 相似符号建议
      max_limit?: number;        // 超出限制时的最大值
    };
  };
}

type ErrorCategory =
  | 'VALIDATION_ERROR'      // 请求参数错误 (400)
  | 'AUTHENTICATION_ERROR'  // 认证失败 (401)
  | 'AUTHORIZATION_ERROR'   // 权限不足 (403)
  | 'NOT_FOUND'             // 资源不存在 (404)
  | 'CONFLICT'              // 资源冲突 (409)
  | 'RATE_LIMITED'          // 请求限流 (429)
  | 'TIMEOUT'               // 执行超时 (504)
  | 'DEPENDENCY_ERROR'      // 依赖服务失败 (502/503)
  | 'INTERNAL_ERROR';       // 内部错误 (500)
```

**错误码规范（四项目统一）**：

| 类别 | 错误码 | HTTP | 说明 |
|------|--------|------|------|
| 验证 | `INVALID_PROJECT` | 400 | 项目不存在或格式错误 |
| 验证 | `INVALID_SYMBOL_PATTERN` | 400 | 符号匹配模式语法错误 |
| 验证 | `INVALID_RANGE` | 400 | 代码范围格式错误 |
| 未找到 | `PROJECT_NOT_INDEXED` | 404 | 项目尚未建立索引 |
| 未找到 | `SYMBOL_NOT_FOUND` | 404 | 符号不存在 |
| 未找到 | `FILE_NOT_FOUND` | 404 | 文件不存在 |
| 解析 | `LANGUAGE_NOT_SUPPORTED` | 422 | 不支持的语言 |
| 解析 | `PARSE_FAILED` | 422 | 代码解析失败 |
| 超时 | `SCAN_TIMEOUT` | 504 | 扫描执行超时 |
| 限流 | `RATE_LIMITED` | 429 | 超出请求速率限制 |
| 限流 | `CONCURRENT_LIMIT` | 429 | 超出并发限制 |
| 服务 | `INDEX_OUTDATED` | 503 | 索引正在重建 |
| 服务 | `SERVICE_OVERLOADED` | 503 | 服务过载 |
| 内部 | `INTERNAL_ERROR` | 500 | 内部服务器错误 |
| 内部 | `CACHE_ERROR` | 500 | 缓存操作失败 |

**错误响应示例**：

```json
{
  "error": {
    "category": "NOT_FOUND",
    "code": "SYMBOL_NOT_FOUND",
    "message": "Symbol 'UserService.validateToken' not found in project 'myapp'",
    "request_id": "req_def456",
    "trace_id": "trace_abc123",
    "timestamp": "2026-03-07T10:31:00Z",
    "retryable": false,
    "details": {
      "suggestion": "Did you mean 'UserService.validateAccessToken'?",
      "similar_symbols": ["UserService.validateAccessToken", "AuthService.validateToken"]
    }
  }
}
```

**幂等性支持**：

- 所有写入操作必须支持 `idempotency_key` 参数
- 相同 key 重放必须返回相同结果，不产生副作用
- idempotency key 有效期至少 24 小时

### 2.1.10 统一查询参数约定（全文强制）

所有列表/查询接口必须支持以下统一参数：

```typescript
interface QueryRequest<T> {
  // 过滤条件
  filter?: {
    [field: string]: {
      eq?: T;           // 等于
      ne?: T;           // 不等于
      gt?: T;           // 大于
      gte?: T;          // 大于等于
      lt?: T;           // 小于
      lte?: T;          // 小于等于
      in?: T[];         // 在列表中
      contains?: string;// 包含子串
      regex?: string;   // 正则匹配
    };
  };

  // 排序
  sort?: Array<{
    field: string;
    order: 'asc' | 'desc';
  }>;

  // 字段选择（减少传输）
  fields?: string[];    // 如 ["id", "name", "status"]

  // 关联展开
  expand?: string[];    // 如 ["evidence", "related_facts"]

  // 分页（游标优先）
  pagination?: {
    limit?: number;     // default: 100, max: 1000
    cursor?: string;    // 游标（优先）
    offset?: number;    // 偏移量（备用）
  };
}

interface QueryResponse<T> {
  items: T[];
  pagination: {
    total?: number;     // 总条目数（可选）
    limit: number;
    cursor?: string;    // 下一页游标
    has_more: boolean;
  };
  meta: {
    request_id: string;
    timestamp: string;
    duration_ms: number;
  };
}
```

**示例**：

```typescript
// 查询请求示例
{
  "filter": {
    "severity": { "in": ["error", "warning"] },
    "created_at": { "gte": "2026-01-01", "lt": "2026-02-01" }
  },
  "sort": [{ "field": "created_at", "order": "desc" }],
  "fields": ["id", "rule_id", "severity", "message"],
  "expand": ["evidence"],
  "pagination": { "limit": 50, "cursor": "eyJpZCI6MTIzfQ==" }
}
```

### 2.1.11 禁止越界规则

**禁止在 `los-ast` 中加入以下能力：**

- ❌ 历史事故经验沉淀（应提交给 `los-memory`）
- ❌ "记住这次教训"的 ledger 写入（应提交给 `los-memory`）
- ❌ "下一步该用哪个模型"的路由决策（应调用 `lsclaw`）
- ❌ "这个任务该谁审批"的工作流判断（应由 `VPS Agent Web` 处理）
- ❌ 用户聊天上下文主存储（应由 `VPS Agent Web` 处理）
- ❌ 审计主记录存储（应由 `VPS Agent Web` 处理）

---

## 2.2 los-memory

### 2.2.1 项目定位

`los-memory` 是 **Project Memory / Corrected Facts Ledger**。

负责长期知识沉淀、纠错记录、否定结论归档、经验复用与可追溯检索。

它回答的问题是：

- 这个项目已经确认过哪些事实？
- 哪些假设曾被证明错误？
- 某类问题过去是如何修复的？
- 哪些经验值得跨会话复用？
- 某条事实何时建立、何时失效、由谁确认？

### 2.2.2 核心职责

`los-memory` 负责：

- corrected facts 存储
- rejected hypotheses 存储
- incident lessons 存储
- long-lived summary 存储
- 事实时序关系维护
- 事实版本与状态管理
- 基于已批准知识的检索
- 知识压缩与归档
- 记忆可信度与来源标注

### 2.2.3 拥有对象

`los-memory` 拥有以下对象：

- `CorrectedFact`
- `RejectedHypothesis`
- `IncidentLesson`
- `MemoryEntry`
- `MemorySummary`
- `TemporalEdge`
- `KnowledgeSourceRef`
- `FactStatus`

**说明：**

- 只有 `los-memory` 拥有"正式入账"的解释权
- 其他系统可以提议写入，但不能越过它直接定义长期真相

### 2.2.4 不负责的内容

`los-memory` 不负责：

- ❌ 代码扫描（归 `los-ast`）
- ❌ AST 解析（归 `los-ast`）
- ❌ provider 路由（归 `lsclaw`）
- ❌ 实时任务执行（归 `VPS Agent Web`）
- ❌ 审批 UI（归 `VPS Agent Web`）
- ❌ 原始 trace 主存储（归 `lsclaw` / `VPS Agent Web`）
- ❌ 运行期流式日志主存储（归 `VPS Agent Web`）
- ❌ 全量代码图谱维护（归 `los-ast`）

### 2.2.5 写入模型

建议区分两种写入语义：

#### proposal - 候选知识提交

- 来源可能是 verifier、人工审批、incident 分析、`los-ast` 输出
- 不等于正式长期事实

#### commit - 正式入账

- 经验证或审批后成为 `CorrectedFact` / `IncidentLesson`
- 由 `los-memory` 执行

这能防止"瞬时结论污染长期记忆"。

#### 2.2.5.1 Commit Authority（关键治理点）

**谁有权触发 commit？**

commit 不是自动发生的，必须由**受控 actor**显式发起：

| Actor 类型 | 触发场景 | 验证要求 |
|------------|----------|----------|
| `VPS Agent Web` | 人工审批通过后 | 必须携带 `approval_id` + `approver_id` |
| `Verifier Service` | 自动化验证通过后 | 必须携带 `verification_report` + `confidence >= threshold` |
| `System Admin` | 紧急修正或批量导入 | 必须携带 `admin_override` + 审计理由 |

**禁止行为**：

- ❌ 任何服务不得绕过审批直接 commit
- ❌ 不得将 proposal 和 commit 合并为单一接口
- ❌ 自动流程不得在没有明确触发器的情况下 commit

**los-memory 必须验证**：

```typescript
interface CommitRequest {
  proposal_id: string;
  actor: {
    type: 'approval' | 'verification' | 'admin';
    id: string;                    // approval_id / verifier_id / admin_id
    evidence: string;              // 触发依据
  };
  scope: RequestScope;             // 必须携带完整 scope
  idempotency_key: string;         // 幂等键
  timestamp: string;
}

// los-memory 验证逻辑
function validateCommit(request: CommitRequest): boolean {
  // 1. 验证 actor 权限
  // 2. 验证 proposal 存在且状态为 'pending'
  // 3. 验证 idempotency_key 未使用
  // 4. 验证 scope 完整性
  // 5. 记录审计日志
}
```

### 2.2.6 检索原则

`los-memory` 检索应优先返回：

- ✅ 已确认
- ✅ 有来源
- ✅ 有时序状态
- ✅ 可归因
- ✅ 可压缩引用

而不是返回未经治理的原始噪声。

### 2.2.7 禁止越界规则

**禁止在 `los-memory` 中加入以下能力：**

- ❌ 直接扫描代码库（应调用 `los-ast`）
- ❌ 直接修改 CodeGraph（应调用 `los-ast`）
- ❌ 直接管理 provider policy（应调用 `lsclaw`）
- ❌ 直接作为任务状态机（应由 `VPS Agent Web` 处理）
- ❌ 存成"什么都往里塞"的大杂烩数据库
- ❌ 直接替代审计系统
- ❌ 直接替代会话系统

---

## 2.3 lsclaw

### 2.3.1 项目定位

`lsclaw` 是 **LLM Gateway / Routing / Governance Brain**。

负责统一多模型 provider 访问、请求标准化、策略执行、成本与风控治理、调用追踪标准化。

它回答的问题是：

- 这次请求应该发给哪个 provider / model？
- 遇到失败该如何 fallback？
- 当前预算和策略是否允许调用？
- 如何把不同模型接口统一成标准格式？
- 如何记录跨 provider 的一致 trace？

### 2.3.2 核心职责

`lsclaw` 负责：

- provider 适配
- 请求/响应标准化
- 路由决策
- fallback / retry / timeout / 熔断
- budget / quota / cost policy
- 模型能力画像
- policy enforcement
- 请求级 tracing / metrics 标准化
- tool registry 的接入治理
- 安全/合规级调用拦截

### 2.3.3 拥有对象

`lsclaw` 拥有以下对象：

- `ProviderProfile`
- `ModelProfile`
- `RoutingPolicy`
- `BudgetPolicy`
- `CircuitState`
- `RequestTrace`
- `NormalizedRequest`
- `NormalizedResponse`
- `ToolPolicy`
- `GuardrailRule`

### 2.3.4 不负责的内容

`lsclaw` 不负责：

- ❌ 长期项目知识账本（归 `los-memory`）
- ❌ 代码图谱（归 `los-ast`）
- ❌ AST rewrite（归 `los-ast`）
- ❌ 业务任务状态机（归 `VPS Agent Web`）
- ❌ 审批 UI（归 `VPS Agent Web`）
- ❌ 项目级会话存档主系统（归 `VPS Agent Web`）
- ❌ 具体业务流程编排（归 `VPS Agent Web`）

### 2.3.5 输入输出约束

`lsclaw` 的输入应该是标准请求，输出应该是标准响应，至少保证：

- ✅ provider 无关
- ✅ model 无关
- ✅ trace id 统一
- ✅ token / latency / cost 统一统计
- ✅ 失败原因标准化
- ✅ tool 调用记录可观测

### 2.3.6 路由范围约束

`lsclaw` 负责的是**调用层治理**，不是完整 agent brain。

**它可以决定：**

- 选哪个模型
- 走不走 fallback
- 是否超预算
- 是否触发安全策略

**它不应决定：**

- 项目业务流程本体
- 某任务审批链路
- 长期记忆写入时机
- 代码分析真相

### 2.3.7 禁止越界规则

**禁止在 `lsclaw` 中加入以下能力：**

- ❌ 长期记忆 ledger
- ❌ 代码 AST 扫描
- ❌ 任务调度引擎
- ❌ 审批流引擎
- ❌ 用户级聊天主存储
- ❌ 直接变成万能 agent runtime

---

## 2.4 VPS Agent Web

### 2.4.1 项目定位

`VPS Agent Web` 是 **Execution Fabric + Control Plane**。

它是用户使用系统的总入口，负责任务编排、执行、审批、审计、会话、追踪展示与多能力组合。

它回答的问题是：

- 用户发起了什么任务？
- 这个任务如何编排执行？
- 哪些步骤需要审批？
- 谁执行了什么动作？
- 结果是什么，链路如何追踪？
- 如何把多个底层系统组合成一个可操作产品？

### 2.4.2 核心职责

`VPS Agent Web` 负责：

- 用户入口
- chat / session
- task / run / workflow orchestration
- HITL (Human-in-the-Loop)
- approval / rejection
- audit view
- dashboard
- trigger / scheduler
- 多系统结果聚合
- 执行状态展示
- 面向用户的 trace 可视化

### 2.4.3 拥有对象

`VPS Agent Web` 拥有以下对象：

- `Task`
- `Run`
- `ExecutionStep`
- `ApprovalRequest`
- `ApprovalDecision`
- `AuditRecord`
- `Session`
- `TraceView`
- `TriggerRule`
- `DashboardProjection`

**说明：**

- 它拥有的是"运行与控制"对象
- 不拥有底层引擎的内部真相对象

### 2.4.4 不负责的内容

`VPS Agent Web` 不负责：

- ❌ 重新实现 provider 路由（应调用 `lsclaw`）
- ❌ 重新实现 AST 内核（应调用 `los-ast`）
- ❌ 重新实现长期记忆账本（应调用 `los-memory`）
- ❌ 作为底层能力真相源
- ❌ 直接篡改底层引擎内部状态

### 2.4.5 编排职责定义

`VPS Agent Web` 的职责是**调用与协调**，不是底层能力本体。

**它可以：**

- 调 `lsclaw` 发起模型调用
- 调 `los-ast` 做分析与 rewrite 建议
- 调 `los-memory` 检索或写入候选事实
- 聚合结果后交给用户审批
- 批准后继续执行后续步骤

**它不应：**

- 在本地偷偷复制一套 provider policy
- 在本地偷偷保存一套代码图谱
- 在本地偷偷维护 corrected facts 真相

### 2.4.6 内部模块化约束（防上帝对象）

为防止 `VPS Agent Web` 演变为难以维护的"上帝对象"，内部必须按以下模块拆分：

```
VPS Agent Web 内部架构
├── Session / Chat Module      # 用户会话与聊天
├── Task / Workflow Module     # 任务与流程编排
├── Approval / Audit Module    # 审批与审计
├── Trigger / Scheduler Module # 触发器与调度
├── Projection / Dashboard     # 展示与仪表板
└── Integration Adapters       # 下游系统集成适配器
```

**模块间约束**：

| 模块 | 允许 | 禁止 |
|------|------|------|
| `Session/Chat` | 管理用户状态、消息历史 | 直接调用 provider API |
| `Task/Workflow` | 编排状态机、步骤流转 | 嵌入 provider routing 逻辑 |
| `Approval/Audit` | 记录审批决策、审计日志 | 直接修改 los-memory 事实 |
| `Projection` | 聚合展示数据 | 直接持久化底层真相对象 |
| `Adapters` | 协议转换、请求转发 | 承载业务规则 |

**关键约束**：

- ✅ orchestration 层通过 adapters 调用下游，不得直接嵌入业务规则
- ✅ UI projection 层只读展示，不直接持久化
- ✅ adapter 层只做协议转换，不承载业务规则
- ✅ 模块间通过内部事件总线通信，不直接依赖对方内部状态

### 2.4.7 禁止越界规则

**禁止在 `VPS Agent Web` 中加入以下能力：**

- ❌ 内嵌完整 provider gateway 替代 `lsclaw`
- ❌ 内嵌 AST 图谱维护替代 `los-ast`
- ❌ 内嵌长期知识账本替代 `los-memory`
- ❌ 以"缓存"为名长期持有底层真相副本

---

## 3. 核心对象归属总表

| 对象 | Source of Truth | 说明 | 消费方 |
|------|-----------------|------|--------|
| CodeGraph | los-ast | 代码结构真相 | VPS Agent Web, los-memory |
| SymbolIndex | los-ast | 符号级索引 | VPS Agent Web |
| EvidenceBundle | los-ast | 代码证据输出 | VPS Agent Web, los-memory |
| Finding | los-ast | 规则匹配结果 | VPS Agent Web |
| CorrectedFact | los-memory | 长期确认事实 | los-ast, VPS Agent Web |
| IncidentLesson | los-memory | 教训沉淀 | los-ast, VPS Agent Web |
| MemorySummary | los-memory | 长期压缩知识 | VPS Agent Web |
| RoutingPolicy | lsclaw | 模型路由规则 | VPS Agent Web |
| BudgetPolicy | lsclaw | 成本预算规则 | VPS Agent Web |
| RequestTrace | lsclaw | 模型调用标准 trace | VPS Agent Web |
| Task | VPS Agent Web | 用户任务对象 | - |
| Run | VPS Agent Web | 执行实例 | - |
| ApprovalRequest | VPS Agent Web | 审批对象 | - |
| AuditRecord | VPS Agent Web | 审计记录 | - |
| Session | VPS Agent Web | 用户会话对象 | - |

---

## 4. 典型协作链路

### 4.1 漏洞扫描与修复建议

**场景**：扫描租户隔离问题并生成修复建议

```
┌─────────────────────────────────────────────────────────────────────┐
│                          协作流程                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. 用户在 VPS Agent Web 发起扫描任务                                │
│        │                                                            │
│        ▼                                                            │
│  2. VPS Agent Web 调用 los-memory 检索历史相关 corrected facts      │
│        │                                                            │
│        ▼                                                            │
│  3. VPS Agent Web 调用 los-ast.discover/discoverTenantBoundaries    │
│     扫描相关模式、生成 evidence 与 impact report                      │
│        │                                                            │
│        ▼                                                            │
│  4. VPS Agent Web 调用 lsclaw 选择模型                               │
│     对 evidence 进行总结与修复建议生成                                │
│        │                                                            │
│        ▼                                                            │
│  5. 用户在 VPS Agent Web 查看结果并审批                               │
│        │                                                            │
│        ▼                                                            │
│  6. 审批通过后，VPS Agent Web 调用 los-ast.generateRewriteCandidate  │
│     生成 patch candidate（或继续触发 patch generation / execution）   │
│        │                                                            │
│        ▼                                                            │
│  7. 若验证后确认形成新事实，VPS Agent Web 提交 proposal 到 los-memory │
│        │                                                            │
│        ▼                                                            │
│  8. los-memory 完成 commit，形成长期知识                             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**边界说明：**

- 代码事实来自 `los-ast`
- 长期历史经验来自 `los-memory`
- 模型调用治理来自 `lsclaw`
- 任务状态与审批来自 `VPS Agent Web`

### 4.2 多模型代码评审

**场景**：对某 PR 做多模型评审并控制成本

```
┌─────────────────────────────────────────────────────────────────────┐
│                          协作流程                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. VPS Agent Web 创建评审任务                                       │
│        │                                                            │
│        ▼                                                            │
│  2. los-ast.validatePatchSafety 提供变更结构、调用影响面、潜在风险点  │
│        │                                                            │
│        ▼                                                            │
│  3. VPS Agent Web 将结构化上下文发送给 lsclaw                        │
│        │                                                            │
│        ▼                                                            │
│  4. lsclaw 按 policy 选择合适模型并记录标准 trace                     │
│     （可能多模型并行评审）                                            │
│        │                                                            │
│        ▼                                                            │
│  5. VPS Agent Web 聚合结果并展示给用户                                │
│        │                                                            │
│        ▼                                                            │
│  6. 对被证实的长期问题模式，提交到 los-memory                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. 接口与通信原则

### 5.1 优先同步契约

MVP 阶段优先使用：

- gRPC 或 OpenAPI
- JSON Schema / Protobuf 明确定义输入输出
- 明确 schema version

**原因：**

- 容易调试
- 容易追踪
- 不易早期过度复杂化

### 5.2 los-ast 服务化演进路径

当前 `los-ast` 为 CLI + 库形式，未来演进为服务：

```
Phase 1: 当前状态（已具备）
┌──────────────────────────────────────────┐
│  CLI 工具 + npm 库                        │
│  - 本地执行                               │
│  - 子进程调用                              │
│  - JSONL 输出                              │
└──────────────────────────────────────────┘

Phase 2: 服务化（推荐下一步）
┌──────────────────────────────────────────┐
│  HTTP API 服务                            │
│  - POST /discover/symbols                 │
│  - POST /discover/callers                 │
│  - POST /validate/isolation               │
│  - POST /enumerate/patterns               │
│  - POST /scan                             │
│  - POST /fix                              │
└──────────────────────────────────────────┘

Phase 3: 完整集成（长期）
┌──────────────────────────────────────────┐
│  gRPC 服务 + Event 集成                   │
│  - 流式响应                               │
│  - 事件驱动                               │
│  - 与 los-memory/lsclaw 深度集成          │
└──────────────────────────────────────────┘
```

### 5.3 异步事件使用原则

异步事件建议作为二阶段增强，而不是一阶段前提。

**适合事件化的内容：**

- `CodeGraphUpdated`
- `RewriteGenerated`
- `CorrectedFactCommitted`
- `RoutingPolicyChanged`
- `ApprovalGranted`
- `RunCompleted`

**不适合事件化替代的内容：**

- 需要强一致实时返回的查询
- 必须立即决策的审批链路
- 核心用户交互路径上的同步反馈

### 5.4 事件语义要求

若引入 event bus，必须满足：

- ✅ 事件名稳定
- ✅ payload 有 schema version
- ✅ 幂等消费
- ✅ 可重放
- ✅ 可追踪 trace id / causation id
- ❌ 不把"查询接口"伪装成事件

---

## 6. 防职责漂移规则

这是最关键的一节，建议原样放进团队 wiki。

### 6.1 越界判断四问

新增功能进入哪个项目前，必须先回答：

1. **它的核心长期状态归谁拥有？**
2. **它的最终写权限归谁？**
3. **它是底层真相，还是上层消费结果？**
4. **放进去后会不会让该项目开始承担第二种系统范式？**

如果回答不清，则不得直接开发。

### 6.2 常见漂移示例

#### 错误示例 A

在 `VPS Agent Web` 中维护一套 provider fallback 逻辑

**问题**：复制了 `lsclaw` 的治理职责

#### 错误示例 B

在 `los-memory` 中保存全量运行 trace

**问题**：把知识账本做成日志垃圾场

#### 错误示例 C

在 `lsclaw` 中做项目级任务状态机

**问题**：从 gateway 漂成 orchestration engine

#### 错误示例 D

在 `los-ast` 中直接写入 corrected facts

**问题**：把分析结论直接升级为长期真相，绕过治理

#### 错误示例 E（针对 los-ast 特定）

在 `los-ast` 中实现用户会话管理

**问题**：CLI 工具不应感知用户会话，应由调用方（VPS Agent Web）管理

### 6.3 允许的缓存原则

允许缓存，但缓存不得成为真相源。

缓存必须满足：

- ✅ 可失效
- ✅ 可重建
- ✅ 有 TTL / version
- ❌ 不改变对象归属

---

## 7. 命名与对外展示建议

内部名可以保留，但对外建议准备友好展示名：

| 内部名 | 对外建议名 | 说明 |
|--------|-----------|------|
| los-ast | Code Kernel / AST Engine | 代码智能内核 |
| los-memory | Memory Ledger / Project Memory | 项目记忆账本 |
| lsclaw | LLM Gateway / AI Gateway | AI 网关 |
| VPS Agent Web | Control Plane / Execution Console | 执行控制台 |

这样有助于：

- 团队外沟通
- 文档清晰度
- 商业化展示
- 减少内部缩写门槛

---

## 8. MVP 建议

### 8.1 最小能力闭环

建议优先形成一个最小闭环，而不是四边都做满。

**第一阶段**（当前 los-ast 已具备）：

| 项目 | MVP 能力 |
|------|----------|
| `los-ast` | scan / fix / explain，支持 Rust/TypeScript |
| `VPS Agent Web` | 任务创建、结果展示、简单审批 |
| `lsclaw` | 统一 provider 调用、trace 记录 |
| `los-memory` | corrected facts 存储与检索 |

**能跑通的闭环：**

```
用户发任务 → los-ast 代码分析 → lsclaw 模型建议 → 人工审批 → 写入长期事实
```

只要这条跑通，后面扩展才稳。

### 8.2 los-ast 当前已实现 vs 目标 API 对照

| 目标 API | 当前实现 | 差距 |
|----------|----------|------|
| `discover_symbols` | `scan` + 符号规则 | 需抽象为独立接口 |
| `discover_callers` | `scan` + 调用图规则 | 需抽象为独立接口 |
| `validate_isolation` | `scan` + 特定规则 | 需抽象为独立接口 |
| `validate_patch_safety` | `fix --dry-run` | 需抽象为独立接口 |
| `enumerate_patterns` | `scan` | 已具备 |
| `enumerate_impacted_modules` | 需新增 | 需实现影响分析 |

### 8.3 第二阶段增强

- `los-ast`：增加 rewrite 与 graph delta、完整 discover/validate/enumerate API
- `los-memory`：增加 rejected hypotheses / incident lessons
- `lsclaw`：增加更复杂策略、预算治理、工具策略
- `VPS Agent Web`：增加 scheduler / trigger / dashboard

---

## 9. 可观测性要求

四个项目都应统一输出可观测数据，至少包括：

- `trace_id`
- `request_id`
- `actor`
- `tenant` / `project` scope
- `latency`
- `error_type`
- `version`
- `causation_id`

推荐统一 OpenTelemetry。

`VPS Agent Web` 负责展示端到端链路，但不是底层 trace 的唯一存储源。

### los-ast 可观测输出

```json
{
  "trace_id": "abc-123",
  "request_id": "req-456",
  "tool": "los-ast",
  "operation": "scan",
  "project": "cantool",
  "files_scanned": 150,
  "findings_count": 12,
  "latency_ms": 2300,
  "timestamp": "2024-01-15T09:30:00.000Z"
}
```

---

## 10. 最终归纳

### los-ast

> **做代码事实，不做长期记忆，不做执行治理。**

### los-memory

> **做长期知识账本，不做代码扫描，不做运行控制。**

### lsclaw

> **做模型调用治理，不做业务编排，不做知识主存。**

### VPS Agent Web

> **做入口、编排、审批、审计，不重做底层内核。**

---

## 附录 A：功能归属速查表

| 问题/功能 | 归属 | 说明 |
|-----------|------|------|
| 查询某函数有哪些调用方 | los-ast | 使用 discover_callers |
| 检查某 patch 影响哪些模块 | los-ast | 使用 validate_patch_safety |
| 保存"这个项目必须加 tenant_id 过滤" | los-memory | 作为 CorrectedFact |
| 保存"上次猜测 root cause 是缓存污染，但被证明错误" | los-memory | 作为 RejectedHypothesis |
| 决定这次请求走 Claude 还是 Gemini | lsclaw | RoutingPolicy |
| 控制超预算时是否降级模型 | lsclaw | BudgetPolicy |
| 展示任务进度、审批记录、执行链路 | VPS Agent Web | Dashboard |
| 批量调度节点执行任务 | VPS Agent Web | Task Orchestration |
| 用户在 UI 里查看 trace | VPS Agent Web | TraceView |
| provider 失败后的 fallback | lsclaw | CircuitBreaker |
| 生成结构化代码证据 | los-ast | EvidenceBundle |
| 将批准后的经验沉淀为 corrected fact | los-memory | 经 VPS Agent Web 提交 |
| 解析 TypeScript AST | los-ast | ast-grep 引擎 |
| 管理用户会话状态 | VPS Agent Web | Session |
| 记录模型调用成本 | lsclaw | RequestTrace |

---

## 附录 B：一句话版决策规则

判断一个新功能放哪里，只看一句：

> **谁拥有它的长期真相，谁就拥有这个功能的核心归属。**

---

## 附录 C：los-ast API 演进路线图

### 当前已实现（v0.x）

```javascript
// CLI 接口
los-ast scan --project <name> --format jsonl
los-ast fix --project <name> --dry-run
los-ast fix --project <name> --apply
los-ast explain --file <path> --line <n> --column <n>

// 库接口
import { scan, fix, explainAtPosition } from '@los-ast/core'
```

### 短期目标（v1.0）- HTTP API

```yaml
openapi: 3.0.0
paths:
  /discover/symbols:
    post:
      summary: 发现符号
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/DiscoverSymbolsRequest'
      responses:
        200:
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DiscoverSymbolsResponse'

  /discover/callers:
    post:
      summary: 发现调用方

  /validate/isolation:
    post:
      summary: 验证隔离实施

  /validate/patch-safety:
    post:
      summary: 验证 patch 安全性

  /enumerate/patterns:
    post:
      summary: 枚举模式匹配

  /enumerate/impacted-modules:
    post:
      summary: 枚举受影响模块

  /scan:
    post:
      summary: 规则扫描

  /fix:
    post:
      summary: 代码修复
```

### 长期目标（v2.0）- gRPC + 流式

```protobuf
service LosAstService {
  rpc DiscoverSymbols(DiscoverSymbolsRequest) returns (DiscoverSymbolsResponse);
  rpc DiscoverCallers(DiscoverCallersRequest) returns (DiscoverCallersResponse);
  rpc ValidateIsolation(ValidateIsolationRequest) returns (ValidateIsolationResponse);
  rpc StreamScan(StreamScanRequest) returns (stream Finding);
  rpc StreamFix(StreamFixRequest) returns (stream FixResult);
}
```

---

## 附录 D：相关文档索引

| 文档 | 路径 | 说明 |
|------|------|------|
| 本架构说明书 | `docs/architecture-boundary-spec.md` | 本文档 |
| 项目架构 | `docs/architecture.md` | los-ast 内部架构 |
| 输出格式 | `docs/ai/OUTPUT_SCHEMA.md` | JSONL 输出规范 |
| AI 使用手册 | `docs/ai/AI_USAGE_GUIDE.md` | AI 如何消费 los-ast |
| 规则编写 | `docs/rules/RULE_AUTHORING.md` | YAML 规则编写规范 |
| 适配器 | `docs/adapters/*.md` | 各项目适配器配置 |

---

## 附录 E：API 错误处理规范（评审补充 v1.2）

### E.1 错误响应标准结构

所有 API 错误必须返回统一结构：

```typescript
interface ErrorResponse {
  error: {
    category: ErrorCategory;     // 错误分类
    code: string;                // 机器可读错误码
    message: string;             // 人类可读描述
    requestId: string;           // 链路追踪 ID
    timestamp: string;           // ISO 8601 时间戳
    details?: {
      field?: string;            // 验证错误字段
      suggestion?: string;       // 修复建议
      retryAfter?: number;       // 限流时重试秒数
      similarSymbols?: string[]; // 相似符号建议
    };
  };
}

type ErrorCategory =
  | 'VALIDATION_ERROR'      // 请求参数错误
  | 'NOT_FOUND'             // 资源不存在
  | 'PARSE_ERROR'           // 代码解析失败
  | 'TIMEOUT'               // 执行超时
  | 'INTERNAL_ERROR'        // 内部错误
  | 'SERVICE_UNAVAILABLE'   // 服务不可用
  | 'RATE_LIMITED';         // 请求限流
```

### E.2 错误码定义

```typescript
const ErrorCodes = {
  // 验证类 (400)
  INVALID_PROJECT: 'INVALID_PROJECT',
  INVALID_SYMBOL_PATTERN: 'INVALID_SYMBOL_PATTERN',
  INVALID_RANGE: 'INVALID_RANGE',
  INVALID_LANGUAGE: 'INVALID_LANGUAGE',

  // 未找到 (404)
  PROJECT_NOT_INDEXED: 'PROJECT_NOT_INDEXED',
  SYMBOL_NOT_FOUND: 'SYMBOL_NOT_FOUND',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  RULE_NOT_FOUND: 'RULE_NOT_FOUND',

  // 解析类 (422)
  LANGUAGE_NOT_SUPPORTED: 'LANGUAGE_NOT_SUPPORTED',
  PARSE_FAILED: 'PARSE_FAILED',
  RULE_SYNTAX_ERROR: 'RULE_SYNTAX_ERROR',

  // 超时 (504)
  SCAN_TIMEOUT: 'SCAN_TIMEOUT',
  ANALYSIS_TIMEOUT: 'ANALYSIS_TIMEOUT',

  // 限流 (429)
  RATE_LIMITED: 'RATE_LIMITED',
  CONCURRENT_SCAN_LIMIT: 'CONCURRENT_SCAN_LIMIT',

  // 服务不可用 (503)
  INDEX_OUTDATED: 'INDEX_OUTDATED',
  SERVICE_OVERLOADED: 'SERVICE_OVERLOADED',

  // 内部错误 (500)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  CACHE_ERROR: 'CACHE_ERROR',
} as const;
```

### E.3 错误响应示例

```json
// 400 Bad Request - 参数验证错误
{
  "error": {
    "category": "VALIDATION_ERROR",
    "code": "INVALID_SYMBOL_PATTERN",
    "message": "The provided ast-grep pattern contains syntax errors",
    "requestId": "req_abc123",
    "timestamp": "2024-03-07T10:30:00Z",
    "details": {
      "field": "pattern.value",
      "suggestion": "Check ast-grep documentation for pattern syntax",
      "parseError": "Unexpected token at position 15"
    }
  }
}

// 404 Not Found - 符号不存在
{
  "error": {
    "category": "NOT_FOUND",
    "code": "SYMBOL_NOT_FOUND",
    "message": "Symbol 'UserService.validateToken' not found in project 'myapp'",
    "requestId": "req_def456",
    "timestamp": "2024-03-07T10:31:00Z",
    "details": {
      "suggestion": "Did you mean 'UserService.validateAccessToken'?",
      "similarSymbols": ["UserService.validateAccessToken", "AuthService.validateToken"]
    }
  }
}

// 429 Too Many Requests - 限流
{
  "error": {
    "category": "RATE_LIMITED",
    "code": "CONCURRENT_SCAN_LIMIT",
    "message": "Maximum concurrent scans exceeded",
    "requestId": "req_xyz789",
    "timestamp": "2024-03-07T10:32:00Z",
    "details": {
      "retryAfter": 30,
      "currentScans": 10,
      "maxScans": 10
    }
  }
}

// 503 Service Unavailable - 索引中
{
  "error": {
    "category": "SERVICE_UNAVAILABLE",
    "code": "INDEX_OUTDATED",
    "message": "Project index is being rebuilt, please retry later",
    "requestId": "req_ghi789",
    "timestamp": "2024-03-07T10:33:00Z",
    "details": {
      "retryAfter": 30,
      "indexStatus": "in_progress",
      "progress": 0.75
    }
  }
}
```

---

## 附录 F：分页与流式响应规范（评审补充 v1.2）

### F.1 分页设计

列表类响应统一使用游标分页：

```typescript
// 请求
interface PaginatedRequest {
  pagination?: {
    limit?: number;      // default: 100, max: 1000
    cursor?: string;     // 游标（优先于 offset）
    offset?: number;     // 偏移量（备用）
  };
}

// 响应
interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    total: number;       // 总条目数（可选，大数据集可能不返回）
    limit: number;
    cursor?: string;     // 下一页游标
    offset?: number;     // 当前偏移量
    hasMore: boolean;
  };
}
```

**分页默认值：**

| 接口 | 默认 limit | 最大 limit |
|------|------------|------------|
| `discover/symbols` | 100 | 1000 |
| `discover/callers` | 100 | 1000 |
| `enumerate/candidates` | 50 | 500 |
| `enumerate/findings` | 50 | 500 |

### F.2 流式响应

适合流式响应的场景使用 Server-Sent Events (SSE)：

```typescript
// 流式扫描请求
interface StreamScanRequest {
  project: string;
  rules: string[];
  progressInterval?: number;  // 进度报告间隔（毫秒）
}

// SSE 事件类型
type SseEvent =
  | { type: 'progress'; data: ProgressEvent }
  | { type: 'finding'; data: Finding }
  | { type: 'complete'; data: CompleteEvent }
  | { type: 'error'; data: ErrorEvent };

interface ProgressEvent {
  filesScanned: number;
  totalFiles: number;
  filesPerSecond: number;
  elapsedMs: number;
  estimatedRemainingMs: number;
}
```

**SSE 响应示例：**

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Request-ID: req_stream_123

event: progress
data: {"filesScanned": 10, "totalFiles": 150, "filesPerSecond": 5}

event: finding
data: {"ruleId": "RUST_UNSAFE_BLOCK", "file": "src/main.rs", ...}

event: finding
data: {"ruleId": "UNUSED_IMPORT", "file": "src/lib.rs", ...}

event: progress
data: {"filesScanned": 50, "totalFiles": 150, "filesPerSecond": 4.8}

event: complete
data: {"filesScanned": 150, "findingsCount": 12, "durationMs": 32000}
```

### F.3 SSE 运营约束（v1.3 补充）

**超时与心跳**：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `heartbeat_interval` | 30s | 无数据时发送心跳注释行 (`:`) |
| `max_stream_duration` | 10m | 单连接最大流持续时间 |
| `client_timeout` | 60s | 客户端无响应断开时间 |

**取消语义**：

```typescript
// 客户端取消：断开 HTTP 连接
// 服务端必须：
// 1. 检测连接断开（通过写入错误）
// 2. 停止扫描任务
// 3. 清理资源
// 4. 记录取消审计日志

interface StreamCancelHandler {
  onClientDisconnect: () => {
    abortController.abort();  // 取消进行中的扫描
    releaseResources();
    auditLog.record('stream_cancelled', { requestId, progress });
  };
}
```

**速率限制与批量化**：

```typescript
// 防止 finding 事件过多导致客户端过载
interface RateLimitConfig {
  // 选项1：节流
  findingThrottleMs: 100;     // 每 100ms 最多一个 finding 事件

  // 选项2：批量化（推荐）
  findingBatchSize: 10;       // 每 10 个 findings 发送一次
  findingBatchTimeoutMs: 500; // 或每 500ms 发送一次
}

// 批量化事件格式
type BatchedSseEvent =
  | { type: 'progress'; data: ProgressEvent }
  | { type: 'findings'; data: Finding[] }  // 批量 findings
  | { type: 'complete'; data: CompleteEvent }
  | { type: 'error'; data: ErrorEvent };
```

**流式响应唯一终止语义**：

- `complete`：正常完成，所有数据已发送
- `error`：异常终止，客户端应检查错误详情
- 连接断开：可能为取消或网络问题，客户端可选择重连

**并发流限制**：

```yaml
streaming_limits:
  max_concurrent_streams_per_client: 3
  max_concurrent_streams_global: 50
  max_streams_per_project_per_minute: 10
```

---

## 附录 G：部署与运维规范

### G.1 资源限制

```yaml
# 资源配额配置
resource_limits:
  # 单请求限制
  per_request:
    max_file_size: 10MB           # 单文件大小限制
    max_files_per_scan: 1000      # 单次扫描最大文件数
    max_ast_nodes: 100000         # 单文件 AST 节点上限
    timeout_seconds: 300          # 单次请求超时

  # 全局限制
  global:
    max_concurrent_scans: 10      # 最大并发扫描数
    max_memory_mb: 4096           # 进程内存上限
    cpu_quota: 2.0                # CPU 配额（核数）

  # 缓存限制
  cache:
    max_entries: 10000            # 缓存条目上限
    max_memory_mb: 512            # 缓存内存上限
    ttl_seconds: 3600             # 缓存过期时间
```

### G.2 健康检查端点

```yaml
# 健康检查配置
health_checks:
  # 存活探针
  liveness:
    endpoint: /healthz/live
    interval: 10s
    timeout: 5s
    failure_threshold: 3

  # 就绪探针
  readiness:
    endpoint: /healthz/ready
    interval: 5s
    timeout: 3s
    failure_threshold: 2
    checks:
      - ast_engine_ready
      - rule_loader_ready
      - cache_initialized

  # 启动探针
  startup:
    endpoint: /healthz/startup
    failure_threshold: 30
    period_seconds: 10
```

### G.3 优雅关闭

```typescript
// 优雅关闭实现
class GracefulShutdown {
  private isShuttingDown = false;
  private activeRequests = new Map<string, AbortController>();

  async handleShutdown(signal: string) {
    console.log(`Received ${signal}, starting graceful shutdown...`);
    this.isShuttingDown = true;

    // 1. 停止接收新请求
    server.close();

    // 2. 等待活跃请求完成（或超时）
    const timeout = setTimeout(() => {
      console.error('Shutdown timeout, forcing exit');
      process.exit(1);
    }, 30000);

    // 3. 取消活跃请求
    for (const controller of this.activeRequests.values()) {
      controller.abort();
    }

    clearTimeout(timeout);
    console.log('Graceful shutdown completed');
    process.exit(0);
  }
}
```

### G.4 多租户隔离

```yaml
# 多租户隔离配置
tenant_isolation:
  # 进程级隔离（推荐初期）
  process_level:
    max_projects_per_worker: 1
    worker_pool_size: 5

  # 容器级隔离（生产推荐）
  container_level:
    namespace: los-ast-workers
    resources_per_pod:
      memory: "2Gi"
      cpu: "1000m"
    max_pods_per_tenant: 3
```

### G.5 可观测性配置

```yaml
# OpenTelemetry 配置
observability:
  tracing:
    enabled: true
    exporter: otlp
    endpoint: http://jaeger-collector:4317
    sampling_rate: 0.1

    custom_spans:
      - scan_operation
      - parse_file
      - rule_match
      - cache_lookup

  metrics:
    enabled: true
    exporter: prometheus
    port: 9090

    custom_metrics:
      - name: los_ast_scans_total
        type: counter
        labels: [project, language, status]

      - name: los_ast_scan_duration_seconds
        type: histogram
        labels: [project, language]
        buckets: [0.1, 0.5, 1, 2, 5, 10, 30]

      - name: los_ast_cache_hit_ratio
        type: gauge
        labels: [cache_type]

  logging:
    format: json
    level: info
    fields:
      - timestamp
      - level
      - message
      - trace_id
      - request_id
      - project
      - duration_ms
```

### G.6 安全加固

```yaml
security_hardening:
  # 输入验证
  input_validation:
    max_file_size: 10MB
    max_nesting_depth: 100
    max_line_length: 10000

  # 路径脱敏
  path_redaction:
    enabled: true
    base_path: /workspace/
    replace_with: "<PROJECT>/"

  # 内容脱敏
  content_filter:
    enabled: true
    patterns:
      - regex: "(password|secret|token)\\s*[:=]\\s*['\"][^'\"]+['\"]"
        replacement: "$1: [REDACTED]"

  # 限流
  rate_limiting:
    requests_per_minute: 60
    burst_size: 10
    per_project:
      max_concurrent_scans: 2
      cooldown_seconds: 30
```

---

## 附录 H：跨系统数据一致性保障

### H.1 问题描述

跨系统数据流转场景：
1. `los-ast` 生成 evidence
2. `VPS Agent Web` 审批
3. 审批通过后写入 `los-memory`

**风险**：步骤 3 失败可能导致状态不一致。

### H.2 推荐策略：幂等写入 + 明确状态机 + 补偿（MVP）

**当前阶段（MVP）不建议直接引入 Saga 编排**，优先保证：

1. **幂等性**：所有写入操作支持 `idempotency_key`
2. **明确状态机**：每个对象有清晰的状态流转
3. **可补偿**：失败时可人工或自动补偿
4. **异步重试**：失败进入重试队列或死信队列

```typescript
// 状态机定义（以 CorrectedFact 为例）
interface CorrectedFactStateMachine {
  states: ['proposed', 'under_review', 'approved', 'committed', 'superseded', 'retracted'];
  transitions: [
    { from: 'proposed', to: 'under_review', trigger: 'start_review' },
    { from: 'under_review', to: 'approved', trigger: 'approve', guard: 'has_approver' },
    { from: 'under_review', to: 'retracted', trigger: 'reject' },
    { from: 'approved', to: 'committed', trigger: 'commit', guard: 'idempotency_check' },
    { from: 'committed', to: 'superseded', trigger: 'supersede', guard: 'new_evidence' },
  ];
}

// 幂等写入示例
interface CommitRequest {
  proposal_id: string;
  actor: { type: string; id: string; evidence: string };
  scope: RequestScope;
  idempotency_key: string;  // 核心：保证幂等
  timestamp: string;
}

// los-memory 必须实现
function commitCorrectedFact(request: CommitRequest): Result {
  // 1. 检查 idempotency_key 是否已使用
  if (idempotencyStore.has(request.idempotency_key)) {
    return { status: 'already_committed', fact_id: existingFactId };
  }

  // 2. 验证 proposal 状态
  if (proposal.status !== 'approved') {
    return { status: 'error', code: 'PROPOSAL_NOT_APPROVED' };
  }

  // 3. 执行 commit（原子操作）
  const fact = createFact(proposal);
  idempotencyStore.set(request.idempotency_key, fact.id);

  return { status: 'success', fact_id: fact.id };
}
```

### H.3 Saga 模式（增强方案，MVP 后考虑）

当系统复杂度增长、跨服务事务增多时，可考虑引入 Saga：

```typescript
// 审批到记忆入账的 Saga（增强方案）
interface ApprovalToMemorySaga {
  name: 'ApprovalToMemorySaga';
  steps: [
    { service: 'VPSAgentWeb'; action: 'updateApprovalStatus'; compensate: 'revertApproval' },
    { service: 'los-memory'; action: 'commitCorrectedFact'; compensate: 'retractFact' },
    { service: 'VPSAgentWeb'; action: 'completeTask' }
  ];
}
```

**采用 Saga 的前提**：
- 跨服务事务 > 3 个步骤
- 补偿操作明确且可自动化
- 有 Saga 编排基础设施

### H.4 最终一致性策略

| 场景 | 策略 | 说明 |
|------|------|------|
| evidence 审批后写入 | 异步事件 + 重试 | 失败时进入死信队列，人工介入 |
| 缓存同步 | 订阅 CodeGraphUpdated 事件 | 最终一致，TTL 兜底 |
| 跨系统 trace | OpenTelemetry 链路传播 | 强一致，必须成功 |

---

## 附录 I：关键对象生命周期模型

### I.1 CorrectedFact 生命周期

```
┌─────────────┐    start_review     ┌─────────────────┐
│  proposed   │ ──────────────────▶ │  under_review   │
└─────────────┘                     └────────┬────────┘
       │                                     │
       │ reject                              │ approve
       │ (guard: has_approver)               │
       ▼                                     ▼
┌─────────────┐                     ┌─────────────────┐
│  retracted  │ ◀────────────────── │    approved     │
└─────────────┘                     └────────┬────────┘
                                             │ commit
                                             │ (guard: idempotency_check)
                                             ▼
                                    ┌─────────────────┐
       supersede                    │    committed    │
       (guard: new_evidence)        └────────┬────────┘
       │                                     │
       ▼                                     │
┌─────────────┐                             │
│ superseded  │ ◀───────────────────────────┘
└─────────────┘
```

**状态说明**：

| 状态 | 说明 | 允许操作 |
|------|------|----------|
| `proposed` | 候选事实已提交 | start_review, reject |
| `under_review` | 审核中 | approve, reject |
| `approved` | 已审批通过 | commit |
| `committed` | 已正式入账 | supersede |
| `superseded` | 被新事实替代 | - |
| `retracted` | 已撤回/拒绝 | - |

### I.2 Task / Run 生命周期

```
┌─────────┐   queue   ┌─────────┐   start   ┌─────────┐
│ created │ ────────▶ │ queued  │ ────────▶ │ running │
└─────────┘           └─────────┘           └────┬────┘
                                                  │
              ┌───────────────────────────────────┼───┐
              │                                   │   │
              ▼                                   ▼   │
       ┌────────────┐                    ┌──────────┐ │
       │   failed   │ ◀───────────────── │ awaiting │ │
       │ (retryable)│   (error/reject)    │approval  │ │
       └─────┬──────┘                    └────┬─────┘ │
             │                                │       │
             │ retry                          │ approve│
             ▼                                ▼       │
       ┌────────────┐                    ┌──────────┐ │
       │  canceled  │ ◀───────────────── │completed │ ◀┘
       └────────────┘      (cancel)      └──────────┘
```

### I.3 RewriteCandidate / PatchCandidate 生命周期

```
┌─────────────┐    review    ┌─────────────┐
│  generated  │ ───────────▶ │   reviewed  │
└─────────────┘              └──────┬──────┘
                                    │
              ┌─────────────────────┼─────┐
              │                     │     │
              ▼ reject              ▼     │ approve
       ┌─────────────┐       ┌──────────┐ │
       │   rejected  │       │ approved │ │
       └─────────────┘       └────┬─────┘ │
                                  │       │
                                  ▼ apply │
                           ┌──────────┐   │
                           │  applied │ ◀─┘
                           └──────────┘
```

### I.4 状态机设计原则

1. **状态必须有明确的进入条件（guard）**
2. **状态变更必须记录审计日志**
3. **允许的状态转换必须显式定义**
4. **终态（final state）必须明确**

---

## 附录 J：能力成熟度分层

| 层级 | 名称 | 能力描述 | 当前状态 |
|------|------|----------|----------|
| **L0** | 单机 CLI | 本地执行，单项目，JSONL 输出 | ✅ 已实现 |
| **L1** | 服务化 API | HTTP API，多项目支持，基础缓存 | 🔄 规划中 |
| **L2** | Web 闭环 | 与 VPS Agent Web 集成，审批流程 | 📋 待启动 |
| **L3** | 一致性审计 | 跨系统一致性，完整审计链路 | 📋 待启动 |
| **L4** | 企业级 | 多租户，弹性扩展，事件驱动 | 📋 远期目标 |

---

## 附录 K：多角色评审摘要

### 架构师评审结论

**评分**: 8.5/10 → **8.3/10（v1.3 修订后）**

**优点**：
- ✅ 分层架构清晰，职责划分明确
- ✅ 创新的治理层（lsclaw）设计
- ✅ 完善的知识沉淀机制
- ✅ 明确的多租户/作用域约束（v1.3 新增）
- ✅ VPS Agent Web 内部模块化约束（v1.3 新增）

**风险与修复状态**：
| 风险 | 状态 | 修复措施 |
|------|------|----------|
| VPS Agent Web "上帝对象" | ✅ 已缓解 | 2.4.6 内部模块化约束 |
| 跨系统数据一致性 | ✅ 已缓解 | H.2 幂等写入 + 状态机优先于 Saga |
| 大规模场景性能 | 🔄 待实施 | 附录 G 部署规范已规划 |

### 后端工程师评审结论（v1.3 修订后）

| 维度 | v1.2 评分 | v1.3 评分 | 修复状态 | 关键改进 |
|------|-----------|-----------|----------|----------|
| API 完整性 | 6/10 | 7/10 | ✅ 已改进 | 新增 generateRewriteCandidate 接口 |
| **错误处理** | **3/10** | **8/10** | ✅ **已补充** | **2.1.9 错误处理公共规范（全文强制）** |
| **查询规范** | - | **7/10** | ✅ **已补充** | **2.1.10 统一查询参数约定** |
| 版本控制 | 5/10 | 6/10 | 🔄 待完善 | Header 版本策略待实施 |
| 性能 | 5/10 | 6/10 | 🔄 待完善 | 流式响应框架已规划 |

**关键修复**：
- ✅ 错误处理从"完全缺失"提升到"全文强制规范"
- ✅ 统一查询参数（filter/sort/fields/expand/pagination）
- ✅ API 命名中性化（fix → generateRewriteCandidate）

### DevOps工程师评审结论（v1.3 修订后）

| 优先级 | 行动项 | 修复状态 | 位置 |
|--------|--------|----------|------|
| **P0** | 资源限制与配额策略 | ✅ 已补充 | 附录 G.1 |
| **P0** | 健康检查端点设计 | ✅ 已补充 | 附录 G.2 |
| **P0** | 优雅关闭机制 | ✅ 已补充 | 附录 G.3 |
| **P0** | 多租户隔离方案 | ✅ 已补充 | 附录 G.4 + 1.4 全局约束 |
| **P0** | 缓存投毒防护 | ✅ 已补充 | 附录 G.6 安全加固 |
| **P1** | OpenTelemetry 集成 | ✅ 已补充 | 附录 G.5 |
| **P1** | CI/CD 集成示例 | ✅ 已补充 | 附录 G.6 |

**推荐部署架构**：
- Kubernetes + Redis 分布式缓存
- HPA 自动扩缩容
- OpenTelemetry 统一可观测性

---

**文档版本**: 1.3.0
**状态**: reviewed
**更新日期**: 2026-03-07
**所有者**: los-ast 团队, lsclaw 团队
**评审者**: 系统架构师、后端工程师、DevOps工程师
**替代版本**: v1.1, v1.2
