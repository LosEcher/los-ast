# los-ast 服务化演进 - 实施路线图 v1.1

**状态**: READY FOR IMPLEMENTATION
**版本**: 1.1.0
**最后更新**: 2026-03-07
**评审评分**: 9/10

---

## 核心原则

> **先稳定语义，再扩平台。**

---

## 一、10条硬约束清单（必须遵守）

### 1. P0 范围冻结
- ✅ 只做：`/healthz/live`, `/healthz/ready`, `/scan`, `/discover/symbols`
- ❌ 不做：rewrite candidate, patch safety, Redis, K8s, WebSocket, SSE, gRPC

### 2. Core/API 硬边界
- Core 只返回领域错误，不感知 HTTP/requestId/scope
- API 负责协议转换，错误映射， governance
- CLI 和 API 共用同一 Core façade

### 3. Scope 模式硬约束
- 生产环境：`tenant_id` + `project_id` + `actor_id` 强制
- 开发环境：允许 `mode: 'local'`
- **生产环境收到 `mode: 'local'` 必须拒绝（HTTP 403）**

### 4. 同步扫描上限（参数化 + 配置来源明确）

```yaml
# config/scan-limits.yaml - 默认值
scan_limits:
  max_files_per_sync_scan: 1000      # 超过则 413
  max_response_bytes: 10485760       # 10MB，超过则 413
  max_duration_ms: 30000             # 30s，超过则 408
```

**配置来源优先级**（从高到低）：
1. 环境变量（如 `MAX_FILES_PER_SYNC_SCAN`）
2. 配置文件
3. 代码默认值

**启动时必须打印生效值**：
```
[STARTUP] Scan limits: maxFiles=1000 (env), maxBytes=10MB (config), maxDuration=30s (default)
```

### 5. 取消语义 P0 必须（区分 client vs server）

**两种取消场景必须分开记录**：

| 场景 | 触发条件 | 服务端行为 | 日志标记 |
|------|----------|------------|----------|
| **Client Cancel** | HTTP 连接断开 | 终止处理，记录 `cancelled_by_client` | `cancelled_by_client: true` |
| **Server Timeout** | 超过 `max_duration_ms` | 返回 408，记录 `timed_out` | `timed_out: true, limit_ms: 30000` |

**禁止混用**：不要把 timeout 记成 client cancel，反之亦然。

### 6. 命名禁用清单
```typescript
// 禁止使用（易引发误解）
['fix', 'applyPatch', 'approvedPatch', 'job', 'memoryCommit', 'committedFact']

// 推荐替代
{
  'fix': 'generateRewriteCandidate',
  'applyPatch': 'proposeChange',
  'job': 'scanTask',        // 避免与 VPS Agent Web 冲突
  'memoryCommit': 'submitToMemory'  // los-ast 只提交，不决定入账
}
```

**⚠️ 风险提示**：`scanTask` 仅表示 los-ast 内部异步分析操作，**不等同于 VPS Agent Web 的执行层任务对象**。禁止抽象为通用 task 系统后与执行层概念混淆。

### 7. Core Façade 版本化 + Breaking Change 规则

```javascript
// packages/core/src/index.mjs
export const CORE_FACADE_VERSION = '1.0.0';

export {
  // 稳定接口，参数对象 schema 冻结
  scan,              // v1.0.0, since 2026-03
  discoverSymbols,   // v1.0.0, since 2026-03
  // 新增接口需标注版本
  // discoverCallers,   // v1.1.0, planned
};
```

**Breaking Change 定义**：
- 变更参数 schema（添加/删除/修改必填字段）
- 变更返回结构（字段类型、嵌套层级）
- 变更错误码含义
- 变更默认行为

**Breaking Change 必须**：
1. 提升 façade major/minor version
2. 更新 golden/contract tests
3. 更新架构文档
4. 通知所有下游系统（lsclaw, VPS Agent Web）

### 8. los-ast 不拥有 Memory 写入主权

**责任主体**：
- los-ast 提供结构化输出
- **VPS Agent Web 或受控集成层**调用 `submitToMemory`
- los-memory 决定是否正式入账（commit）

**禁止**：los-ast 直接调用 memory commit 接口

### 9. 契约冻结点
| Milestone | 冻结内容 | 日期 |
|-----------|----------|------|
| A 结束 | `/scan`, `/discover/symbols` 基础契约 | T+2w |
| B 结束 | Async job 模式与分页策略 | T+4w |
| C 结束 | 跨系统集成契约 | T+6w |

### 10. Golden Case 集
A 阶段交付物必须包含：
- `fixtures/golden/cantool-sample/` - 小型 Rust 项目
- `fixtures/golden/lsclaw-sample/` - 中型 TS 项目
- `fixtures/golden/mini-js/` - 微型 JS 项目（用于快速验证）

---

## 二、Milestone A：服务化最小可用（Week 1-2）

### 2.1 目标
把 Core 包装成稳定 HTTP façade，验证服务化架构是否成立。

### 2.2 交付物清单

| 类别 | 交付物 | 验收标准 |
|------|--------|----------|
| API | `/healthz/live` | HTTP 200, `{status: "alive"}` |
| API | `/healthz/ready` | Core 加载完成返回 200，否则 503 |
| API | `/scan` | 完整 findings，支持取消，超时 30s |
| API | `/discover/symbols` | 支持简单 limit，最大 1000 |
| 治理 | Scope 验证 | 生产强制完整 scope，开发允许 local |
| 治理 | 统一错误模型 | category/code/message/requestId/timestamp/retryable |
| 治理 | 取消语义 | Client disconnect → 中断扫描 |
| 部署 | Docker Compose | `docker-compose up` 本地可运行 |
| 测试 | 单元测试 | Core façade 覆盖率 > 60% |
| 测试 | 集成测试 | API 端到端覆盖 |
| 测试 | Golden Case | 3 个固定 repo 样本，固定输出特征 |
| 文档 | API 文档 | OpenAPI 3.0 基础规范 |

### 2.3 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| API 层 | TypeScript + Fastify | 新代码用 TS |
| Core 层 | JavaScript (保持) | 稳定，暂不迁移 |
| 测试 | Vitest + Supertest | 单元 + 集成 |
| 部署 | Docker Compose | 本地开发 |

### 2.4 目录结构

```
packages/
├── core/                    # 保持 JavaScript
│   ├── src/
│   │   ├── index.mjs        # 导出稳定 façade (v1.0.0)
│   │   ├── runner.mjs
│   │   ├── rules.mjs
│   │   └── parse-cache.mjs
│   └── package.json
│
├── api/                     # TypeScript
│   ├── src/
│   │   ├── server.ts
│   │   ├── router.ts
│   │   ├── plugins/
│   │   │   ├── error-handler.ts
│   │   │   ├── scope-validator.ts    # 硬约束 #3
│   │   │   ├── request-id.ts
│   │   │   └── cancellation.ts       # 硬约束 #5
│   │   ├── routes/
│   │   │   ├── health.ts
│   │   │   ├── scan.ts               # 硬约束 #4
│   │   │   └── discover.ts
│   │   └── services/
│   │       ├── scan-service.ts
│   │       └── symbol-service.ts
│   └── package.json
│
├── cli/                     # 未来调用 api 或保持本地
└── adapters/

fixtures/
└── golden/                  # 硬约束 #10
    ├── cantool-sample/
    ├── lsclaw-sample/
    └── mini-js/
```

### 2.5 关键实现细节

#### Scope 验证（生产硬拒绝 local）

```typescript
// packages/api/src/plugins/scope-validator.ts
export function scopeValidator(env: 'production' | 'development') {
  return async (req: FastifyRequest, res: FastifyReply) => {
    const scope = req.body.scope;

    if (!scope) {
      return res.status(400).send({
        error: { code: 'MISSING_SCOPE', message: 'scope is required' }
      });
    }

    // 硬约束 #3: 生产环境拒绝 local
    if (env === 'production' && scope.mode === 'local') {
      return res.status(403).send({
        error: {
          code: 'LOCAL_SCOPE_FORBIDDEN',
          message: 'scope.mode=local is not allowed in production'
        }
      });
    }

    // 生产环境强制完整 scope
    if (env === 'production') {
      if (!scope.tenant_id || !scope.project_id || !scope.actor_id) {
        return res.status(400).send({
          error: {
            code: 'INCOMPLETE_SCOPE',
            message: 'tenant_id, project_id, actor_id are required in production'
          }
        });
      }
    }

    req.scope = scope;
  };
}
```

#### 同步扫描上限（参数化）

```typescript
// packages/api/src/config/scan-limits.ts
export const SCAN_LIMITS = {
  maxFilesPerSyncScan: parseInt(process.env.MAX_FILES_PER_SYNC_SCAN || '1000'),
  maxResponseBytes: parseInt(process.env.MAX_RESPONSE_BYTES || '10485760'), // 10MB
  maxDurationMs: parseInt(process.env.MAX_SCAN_DURATION_MS || '30000'),     // 30s
};

// packages/api/src/services/scan-service.ts
export class ScanService {
  async execute(params: ScanParams, signal: AbortSignal) {
    // 1. 预估检查
    const estimatedFiles = await this.estimateFileCount(params);
    if (estimatedFiles > SCAN_LIMITS.maxFilesPerSyncScan) {
      throw createError('SCAN_TOO_LARGE',
        `Estimated ${estimatedFiles} files exceeds limit ${SCAN_LIMITS.maxFilesPerSyncScan}. ` +
        `Use smaller include patterns or async job mode (Milestone B).`,
        { limit: SCAN_LIMITS.maxFilesPerSyncScan, estimated: estimatedFiles }
      );
    }

    // 2. 执行扫描（带超时和取消）
    return await this.runWithTimeoutAndCancellation(
      () => core.scan(params, signal),
      SCAN_LIMITS.maxDurationMs,
      signal
    );
  }
}
```

#### 取消语义实现

```typescript
// packages/api/src/plugins/cancellation.ts
export function withCancellation(handler: RouteHandler) {
  return async (req: FastifyRequest, res: FastifyReply) => {
    const abortController = new AbortController();

    // Client disconnect → 取消
    res.raw.on('close', () => {
      if (!res.writableEnded) {
        req.log.info('Client disconnected, aborting operation');
        abortController.abort();
      }
    });

    try {
      await handler(req, res, abortController.signal);
    } catch (error) {
      if (error.name === 'AbortError' || error.code === 'ABORTED') {
        req.log.info('Operation aborted');
        // 不返回错误，静默处理
        return;
      }
      throw error;
    }
  };
}

// Core runner 支持 signal
export async function scan(params: ScanParams, signal?: AbortSignal) {
  for (const file of params.files) {
    if (signal?.aborted) {
      const error = new Error('Scan cancelled by client');
      error.name = 'AbortError';
      error.code = 'ABORTED';
      throw error;
    }
    await processFile(file);
  }
}
```

### 2.6 工时评估（修订后）

| 任务 | 工时 | 说明 |
|------|------|------|
| API 层 TypeScript 搭建 | 8h | 含 Fastify 配置、热重载 |
| `/healthz/*` | 4h | live + ready |
| `/scan` | 16h | 含取消语义、超时控制、上限检查 |
| `/discover/symbols` | 12h | 含简单分页 |
| Scope 验证（含 local 模式） | 8h | 硬约束 #3 |
| 统一错误模型 | 8h | 含 Core 错误映射 |
| Docker Compose | 8h | 含热重载配置 |
| 单元测试 | 16h | Core façade 覆盖 |
| 集成测试 | 16h | API 端到端 |
| Golden Case 准备 | 8h | 3 个样本 |
| **总计** | **104h** | **2.6 人周** |

---

## 三、Milestone B：语义增强（Week 3-4）

### 3.1 目标
增加结构化能力，处理大响应体。

### 3.2 交付物

| 能力 | 说明 |
|------|------|
| `/discover/callers` | 调用关系发现 |
| `/validate/patch-safety` | Patch 安全验证（dry-run） |
| `/enumerate/patterns` | 模式枚举 |
| Async Job 模式 | 大响应体处理（选择理由见下） |
| 分页完善 | cursor/offset |
| Profiling | 内存/CPU 分析 |
| Load Tests | 压力测试 |
| OpenAPI 文档 | 完整契约 |

### 3.3 关键决策：Async Job vs SSE

**选择 Async Job，理由**：

1. 服务端实现简单（无需管理长连接）
2. 测试更稳定（可轮询验证）
3. 客户端兼容面更广（无需 SSE 支持）
4. 资源释放模型更容易控制（连接断开后资源自然释放）
5. **在未确认真实实时进度需求前，SSE 不是必要前置**

**实现**：

```typescript
// Async Job 模式
POST /scan
→ 202 Accepted
→ { data: { scanTaskId: "task_123", status: "queued" } }  // 硬约束 #6: 用 task 而非 job

GET /scan-tasks/task_123           // 硬约束 #6: 用 scan-tasks 而非 jobs
→ { data: { status: "running", progress: { filesScanned: 50, total: 100 } } }

GET /scan-tasks/task_123/result
→ { data: { findings: [...] }, meta: { completedAt } }
```

---

## 四、Milestone C：生态接入（Week 5-6）

### 4.1 目标
让其他三个系统可稳定消费。

### 4.2 交付物

| 能力 | 说明 |
|------|------|
| `lsclaw` auth integration | JWT 验证 |
| `VPS Agent Web` callback | 任务完成通知 |
| `los-memory` client | 结果提交（非决定入账） |
| `/generate-rewrite-candidate` | 改写候选生成 |
| Contract tests | Pact 契约测试 |
| Idempotency / retries | 幂等键与重试 |

### 4.3 los-ast 与 los-memory 边界（硬约束 #8）

```typescript
// los-ast 只提交，不决定入账
interface LosAstOutput {
  findings: Finding[];
  // 提交建议，但不强制
  proposedForMemory?: {
    facts: ProposedFact[];
    reason: string;
  };
}

// 调用方决定是否提交
// VPS Agent Web 或集成层：
await losMemory.submitProposal({
  source: 'los-ast',
  proposal: losAstOutput.proposedForMemory,
  // 需要审批后才 commit
});

// los-memory 决定是否入账
await losMemory.commit({ /* 审批后 */ });
```

---

## 五、Milestone D：平台化部署（Week 7-8）

### 5.1 前置检查清单（必须全部通过）

- [ ] 单实例内存控制验证（无泄漏，24h 压测）
- [ ] 超时/取消机制验证（100% 取消成功率）
- [ ] 大仓库扫描行为基准测试（>10k 文件）
- [ ] API 契约冻结（无 breaking change 30 天）
- [ ] 回归测试覆盖率 > 80%

### 5.2 交付物

| 能力 | 前提 |
|------|------|
| Redis / Bull | 确认有真实异步需求 |
| K8s / HPA | 单机已稳定，需要水平扩展 |
| Grafana dashboards | 可观测性完善 |
| Alerting | 生产告警 |

---

## 六、风险清单（最终版）

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| Core/API 语义漂移 | 中 | 高 | 硬约束 #2, Golden Case, 契约测试 |
| Scope 约束与本地调试冲突 | 低 | 中 | 硬约束 #3, local 模式 |
| 大响应体导致网关超时 | 中 | 高 | 硬约束 #4, Async Job 模式 |
| Rewrite candidate 语义不稳定 | 中 | 高 | 硬约束 #6, 后移到 C |
| Tree-sitter WASM 性能 | 中 | 中 | 超时控制，渐进扫描 |
| TS 迁移回归 | 低 | 中 | Core 保持 JS，API 层新 TS |
| 下游接口变更 | 中 | 中 | 契约冻结点，Mock 服务 |
| 内存泄漏 | 低 | 高 | 压测，监控，硬约束 #5 |

---

## 七、命名规范（硬约束 #6 展开）

### 禁用词

| 禁用词 | 原因 | 替代 |
|--------|------|------|
| `fix` | 暗示已完成修复 | `generateRewriteCandidate` |
| `applyPatch` | 暗示已应用 | `proposeChange` |
| `approvedPatch` | 审批状态混淆 | `candidateAwaitingApproval` |
| `job` | 与 VPS Agent Web 冲突 | `scanTask`, `analysisTask` |
| `memoryCommit` | los-ast 不拥有写入权 | `submitToMemory` |
| `committedFact` | 状态误导 | `proposedFact` |

### 推荐前缀

| 前缀 | 用途 | 示例 |
|------|------|------|
| `generate*` | 生成候选 | `generateRewriteCandidate` |
| `propose*` | 提议变更 | `proposeChange` |
| `discover*` | 发现结构 | `discoverSymbols`, `discoverCallers` |
| `validate*` | 验证假设 | `validatePatchSafety` |
| `enumerate*` | 枚举列表 | `enumeratePatterns` |
| `submit*` | 提交给下游 | `submitToMemory` |

---

## 八、团队配置

| 角色 | 人数 | A | B | C | D |
|------|------|---|---|---|---|
| 技术负责人 | 1 | ✓ | ✓ | ✓ | ✓ |
| 后端工程师 | 2 | ✓✓ | ✓✓ | ✓✓ | ✓ |
| DevOps 工程师 | 1 | - | - | 0.5 | ✓ |
| 测试工程师 | 1 | 0.5 | ✓ | ✓ | 0.5 |

---

## 九、立即行动

### 今天

1. 创建分支 `feat/api-service-mvp`
2. 初始化 `packages/api` 目录结构
3. 添加 `packages/core/src/index.mjs` 导出稳定 façade
4. 配置 TypeScript 编译

### 本周

1. 实现 `GET /healthz/live`
2. 实现 `GET /healthz/ready`（检查 Core 加载状态）
3. 定义 `fixtures/golden/` 样本
4. 编写第一个集成测试

---

## 十、文档索引

| 文档 | 路径 | 说明 |
|------|------|------|
| 架构边界说明书 | `docs/architecture-boundary-spec.md` | 四项目职责边界 |
| 本实施路线图 | `docs/implementation-roadmap-v1.1.md` | 实施主文档 |
| API 规范 | `docs/api/openapi.yaml` | OpenAPI 3.0 |
| 部署入口 | `deploy/docker-compose.yml` | 当前部署编排入口（K8s 规划待补充） |

---

---

## 十一、Milestone A 验收点（必须全部通过）

| 序号 | 验收点 | 验证方式 |
|------|--------|----------|
| 1 | `packages/core/src/index.mjs` façade 真正稳定 | 接口版本号锁定，CLI/API 共用同一 façade 无差异 |
| 2 | `/scan` 三种边界行为可测 | 取消（client disconnect）、超时（408）、过大（413）均有测试覆盖 |
| 3 | `scope.mode=local` 在生产确实被拒绝 | 生产环境返回 403，开发环境允许通过 |
| 4 | Golden case 集跑通 | `fixtures/golden/` 下 3 个样本仓库，固定输入输出验证通过 |

**这四个验收点一旦全部通过，Milestone B/C/D 的执行会顺很多。**

---

**结论**: 本方案已通过架构评审（9/10），具备开工条件。请严格遵守 10 条硬约束，按 Milestone A → B → C → D 顺序执行。
