# los-ast 服务化演进 - 统一实施计划

**状态**: CONSOLIDATED & READY FOR EXECUTION
**版本**: 1.0.0
**最后更新**: 2026-03-07
**总工时**: 139h (2.5 人周，2工程师并行)

---

## 一、最终目录结构

```
los-ast/
├── packages/
│   ├── core/                          # JavaScript - 保持稳定
│   │   ├── src/
│   │   │   ├── index.mjs              # v1.0.0 Core Façade (已存在，需增强)
│   │   │   ├── runner.mjs             # scan/fix/explain (已存在)
│   │   │   ├── rules.mjs              # 规则加载 (已存在)
│   │   │   ├── parse-cache.mjs        # AST缓存 (已存在)
│   │   │   └── languages.mjs          # 语言支持 (已存在)
│   │   └── package.json
│   │
│   ├── api/                           # TypeScript - 新增
│   │   ├── src/
│   │   │   ├── server.ts              # Fastify 入口
│   │   │   ├── config/
│   │   │   │   ├── index.ts           # 配置聚合
│   │   │   │   ├── scan-limits.ts     # 扫描限制 (硬约束#4)
│   │   │   │   └── scope.ts           # Scope 配置
│   │   │   ├── plugins/
│   │   │   │   ├── error-handler.ts   # 统一错误模型
│   │   │   │   ├── scope-validator.ts # Scope验证 (硬约束#3)
│   │   │   │   ├── request-id.ts      # Request ID 中间件
│   │   │   │   ├── cancellation.ts    # 取消语义 (硬约束#5)
│   │   │   │   └── health-check.ts    # 健康检查
│   │   │   ├── routes/
│   │   │   │   ├── health.ts          # /healthz/live, /healthz/ready
│   │   │   │   ├── scan.ts            # /scan (硬约束#4)
│   │   │   │   └── discover.ts        # /discover/symbols
│   │   │   ├── services/
│   │   │   │   ├── scan-service.ts    # 扫描业务逻辑
│   │   │   │   └── symbol-service.ts  # 符号发现服务
│   │   │   └── types/
│   │   │       ├── index.ts           # 共享类型
│   │   │       └── errors.ts          # 错误类型定义
│   │   ├── tests/
│   │   │   ├── unit/                  # 单元测试
│   │   │   └── integration/           # 集成测试
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── cli/                           # 未来调用API或保持本地
│   │   └── src/
│   │       └── index.mjs
│   │
│   └── shared/                        # 共享类型和工具
│       ├── src/
│       │   ├── types/
│       │   │   └── api.ts             # API共享类型
│       │   └── utils/
│       │       └── index.ts
│       └── package.json
│
├── fixtures/
│   └── golden/                        # 硬约束#10
│       ├── cantool-sample/            # 小型Rust项目
│       ├── lsclaw-sample/             # 中型TS项目
│       └── mini-js/                   # 微型JS项目
│
├── deploy/
│   ├── docker-compose.yml             # 部署编排
│   ├── Dockerfile                     # API 镜像构建
│   └── init.sql                       # 初始化脚本
│
└── docs/
    ├── architecture-boundary-spec.md  # 架构边界说明书
    ├── implementation-roadmap-v1.1.md # 实施路线图
    ├── implementation-plan-consolidated.md # 本文档
    └── api/
        └── openapi.yaml               # OpenAPI 3.0 规范

```

---

## 二、技术决策汇总

### 2.1 框架选择

| 决策项 | 选择 | 理由 |
|--------|------|------|
| API框架 | **Fastify** | 性能更优、原生TypeScript支持、内置schema验证、生态成熟 |
| 语言 | **TypeScript** (API层) | 与CLI类型一致、开发体验好、类型安全 |
| Core层 | **保持JavaScript** | 稳定性优先，暂不迁移 |
| 测试框架 | **Vitest** | Vite生态、TypeScript原生、性能优秀 |
| 部署 | **Docker + K8s** | 标准化容器化、水平扩展能力 |

### 2.2 核心接口契约

```typescript
// Core Façade v1.0.0 (packages/core/src/index.mjs)
export const CORE_FACADE_VERSION = '1.0.0';

// 稳定接口
export function scan(params: ScanParams, signal?: AbortSignal): Promise<ScanResult>;
export function discoverSymbols(params: DiscoverParams, signal?: AbortSignal): Promise<SymbolResult>;
export function discoverFiles(params: DiscoverFilesParams): Promise<string[]>;
```

### 2.3 关键设计模式

1. **硬边界模式**: Core 只返回领域错误，API 层负责 HTTP 协议转换
2. **Scope 验证模式**: 生产环境强制完整 scope，开发环境允许 `mode: 'local'`
3. **取消语义模式**: Client disconnect → 中断扫描，区分于 Server timeout
4. **超时控制模式**: 30s 扫描超时，413/408 状态码

---

## 三、任务清单（32项）

### Phase 1: 基础设施 (Task 1-5) - 24h

| ID | 任务 | 工时 | 依赖 | 负责人 |
|----|------|------|------|--------|
| 1 | 创建 `packages/api` 目录结构 | 2h | - | BE-1 |
| 2 | 配置 TypeScript 编译 (tsconfig.json) | 3h | 1 | BE-1 |
| 3 | 配置 Fastify 基础框架 | 4h | 2 | BE-1 |
| 4 | 配置 Vitest 测试框架 | 3h | 2 | BE-1 |
| 5 | Docker Compose 本地开发环境 | 8h | 3 | DevOps |
| 6 | 创建 shared types 包 | 4h | 1 | BE-2 |

**Phase 1 关键路径**: 1 → 2 → 3 → 5 (17h)

### Phase 2: Core Façade 稳定化 (Task 7-9) - 12h

| ID | 任务 | 工时 | 依赖 | 负责人 |
|----|------|------|------|--------|
| 7 | Core index.mjs 导出版本常量 | 2h | - | BE-1 |
| 8 | Core 函数添加 AbortSignal 支持 | 6h | 7 | BE-1 |
| 9 | Core façade 单元测试 (覆盖率>60%) | 4h | 8 | BE-2 |

### Phase 3: API 核心功能 (Task 10-18) - 56h

| ID | 任务 | 工时 | 依赖 | 负责人 |
|----|------|------|------|--------|
| 10 | 统一错误模型实现 | 6h | 6 | BE-2 |
| 11 | Request ID 中间件 | 2h | 3 | BE-1 |
| 12 | Scope 验证插件 | 6h | 10 | BE-2 |
| 13 | 取消语义插件 | 4h | 8 | BE-1 |
| 14 | 扫描限制配置 | 3h | 10 | BE-2 |
| 15 | `/healthz/live` 实现 | 2h | 3 | BE-1 |
| 16 | `/healthz/ready` 实现 | 2h | 3 | BE-1 |
| 17 | `/scan` 完整实现 | 14h | 12,13,14 | BE-1 |
| 18 | `/discover/symbols` 实现 | 12h | 12 | BE-2 |
| 19 | OpenAPI 3.0 规范 | 5h | 17,18 | BE-2 |

**Phase 3 关键路径**: 10 → 12 → 17 (26h)

### Phase 4: 测试与质量 (Task 20-26) - 32h

| ID | 任务 | 工时 | 依赖 | 负责人 |
|----|------|------|------|--------|
| 20 | API 集成测试框架 | 4h | 5 | QA |
| 21 | `/scan` 集成测试 | 6h | 17,20 | QA |
| 22 | `/discover/symbols` 集成测试 | 4h | 18,20 | QA |
| 23 | 取消语义集成测试 | 4h | 13,20 | QA |
| 24 | 超时/413 边界测试 | 4h | 14,20 | QA |
| 25 | Golden Case 样本准备 | 6h | - | QA |
| 26 | Golden Case 测试验证 | 4h | 21,25 | QA |

### Phase 5: 部署与文档 (Task 27-32) - 15h

| ID | 任务 | 工时 | 依赖 | 负责人 |
|----|------|------|------|--------|
| 27 | API 层 Dockerfile | 3h | 17,18 | DevOps |
| 28 | 生产环境配置模板 | 2h | 27 | DevOps |
| 29 | CI/CD Pipeline (GitHub Actions) | 4h | 27 | DevOps |
| 30 | 部署文档 | 3h | 28 | DevOps |
| 31 | API 使用文档 | 3h | 19 | BE-2 |
| 32 | Milestone A 验收检查 | - | 全部 | TL |

---

## 四、依赖关系图

```
Phase 1: 基础设施
├── Task 1: 目录结构
├── Task 2: TS配置 ──▶ Task 3: Fastify
├── Task 4: Vitest                      ──▶ Phase 2
├── Task 5: Docker Compose ────────────────▶ Phase 3
└── Task 6: Shared types

Phase 2: Core Façade
├── Task 7: 版本常量
├── Task 8: AbortSignal ──▶ Phase 3 Task 13
└── Task 9: 单元测试

Phase 3: API 核心
├── Task 10: 错误模型 ──┬──▶ Task 12: Scope验证 ──┬──▶ Task 17: /scan
│                       │                        │
├── Task 11: Request ID ┘                        ├──▶ Task 18: /discover
├── Task 13: 取消语义 ──┘                        │
├── Task 14: 扫描限制 ───────────────────────────┘
├── Task 15-16: Healthz
└── Task 19: OpenAPI

Phase 4: 测试
├── Task 20: 测试框架
├── Task 21-26: 各类测试
└── Task 25-26: Golden Case

Phase 5: 部署
├── Task 27-30: Docker/K8s/CI
└── Task 31: 文档
```

---

## 五、风险缓解清单

| 风险 | 缓解措施 | 负责人 | 检查点 |
|------|----------|--------|--------|
| Core/API 语义漂移 | 硬约束#2 + Golden Case + 契约测试 | TL | Task 26 |
| Scope 约束冲突 | 硬约束#3 + local 模式 | BE-2 | Task 12 |
| 大响应体网关超时 | 硬约束#4 + 413/408 处理 | BE-1 | Task 17 |
| 取消语义实现复杂 | 参考实现模板 + 集成测试 | BE-1 | Task 23 |
| 内存泄漏 | 压测 + 监控 | DevOps | Milestone B |
| 下游接口变更 | 契约冻结点 + Mock | TL | Milestone C |

---

## 六、代码规范

### 6.1 命名规范 (硬约束#6)

| 禁用词 | 替代方案 |
|--------|----------|
| `fix` | `generateRewriteCandidate` |
| `applyPatch` | `proposeChange` |
| `job` | `scanTask` |
| `memoryCommit` | `submitToMemory` |

### 6.2 推荐前缀

- `generate*` - 生成候选
- `propose*` - 提议变更
- `discover*` - 发现结构
- `validate*` - 验证假设
- `enumerate*` - 枚举列表

---

## 七、立即行动项

### 今天 (Day 1)

```bash
# 1. 创建分支
git checkout -b feat/api-service-mvp

# 2. 初始化 packages/api
mkdir -p packages/api/{src/{config,plugins,routes,services,types},tests/{unit,integration}}

# 3. 初始化 packages/shared
mkdir -p packages/shared/src/{types,utils}

# 4. 创建 initial commit
git add packages/api packages/shared
git commit -m "chore(api): initialize api and shared packages structure"
```

### 本周 (Week 1)

- [ ] **BE-1**: 完成 Task 1-5, 7-8, 11, 13, 15-17 (基础框架 + /scan)
- [ ] **BE-2**: 完成 Task 6, 10, 12, 18 (错误模型 + /discover)
- [ ] **QA**: 完成 Task 25 (Golden Case 样本)
- [ ] **DevOps**: 完成 Task 5 (Docker Compose)

### Week 2

- [ ] 完成所有测试 (Task 19-26)
- [ ] 完成部署配置 (Task 27-30)
- [ ] 完成文档 (Task 31)
- [ ] Milestone A 验收 (Task 32)

---

## 八、验收标准

### 8.1 Milestone A 验收点

| 序号 | 验收点 | 验证方式 | 状态 |
|------|--------|----------|------|
| 1 | Core façade v1.0.0 稳定 | 接口版本锁定，CLI/API共用 | ⬜ |
| 2 | `/scan` 边界行为可测 | 取消/超时/过大均有测试 | ⬜ |
| 3 | `scope.mode=local` 生产拒绝 | 生产403，开发允许 | ⬜ |
| 4 | Golden Case 跑通 | 3个样本固定输出验证 | ⬜ |

**全部通过后方可进入 Milestone B**

---

## 九、附录

### 9.1 环境变量清单

```bash
# Core
CORE_FACADE_VERSION=1.0.0

# API
NODE_ENV=production|development
PORT=3000

# Scan Limits (硬约束#4)
MAX_FILES_PER_SYNC_SCAN=1000
MAX_RESPONSE_BYTES=10485760
MAX_SCAN_DURATION_MS=30000

# Scope (硬约束#3)
REQUIRE_FULL_SCOPE=true|false
```

### 9.2 关键文件模板位置

| 模板 | 路径 |
|------|------|
| Scope Validator | `packages/api/src/plugins/scope-validator.ts` |
| Cancellation Plugin | `packages/api/src/plugins/cancellation.ts` |
| Scan Service | `packages/api/src/services/scan-service.ts` |
| Error Handler | `packages/api/src/plugins/error-handler.ts` |

### 9.3 参考文档

- [架构边界说明书](./architecture-boundary-spec.md)
- [实施路线图 v1.1](./implementation-roadmap-v1.1.md)
- [OpenAPI 规范](./api/openapi.yaml)

---

**结论**: 本计划整合了架构师、后端工程师、DevOps工程师和项目经理的多角色输出，具备立即执行条件。请按 Phase 顺序推进，严格遵守 10 条硬约束，确保 Milestone A 四大验收点全部通过。
