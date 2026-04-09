# los-ast 项目多角色综合分析报告

**分析日期**: 2026-04-01  
**分析范围**: 全仓库代码、架构、适配器、规则体系、测试覆盖

---

## 执行摘要

`los-ast` 是一个面向多代码库的通用 AST 扫描与改写工具，定位于"代码治理与结构化扫描内核"。项目具有清晰的稳定面与预览面分层，已在 `lsclaw` 和 `cantool` 两个外部项目中形成实际适配。核心代码约 **36K 行**，测试文件 **39 个**，具备较为完善的契约测试与质量门禁体系。

---

## 一、技术架构师视角：现状与架构评估

### 1.1 分层架构概览

```
┌─────────────────────────────────────────────────────────────┐
│  Stable Surface (稳定面)                                    │
│  ├─ packages/core      (~851 loc) - AST 扫描内核            │
│  ├─ packages/cli       (~3000+ loc) - CLI 与 Evidence 导出  │
│  ├─ /healthz/live, /healthz/ready - 健康检查                │
│  └─ POST /scan, POST /discover/symbols - 核心 API           │
├─────────────────────────────────────────────────────────────┤
│  Preview Surface (预览面)                                   │
│  ├─ packages/api/src/routes/experimental/* (~2024 loc)      │
│  ├─ packages/api/src/routes/vps-agent-web/*                 │
│  ├─ incident/approval/recovery/memory 工作流                │
│  └─ attribution/hotreload 服务                              │
├─────────────────────────────────────────────────────────────┤
│  Adapter Layer (适配器层)                                   │
│  ├─ packages/adapters - 项目配置抽象                        │
│  ├─ rules/languages/* - 语言级规则 (JS/TS/Rust/TSX)         │
│  └─ rules/projects/*  - 项目特化规则                        │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 代码规模分布

| 包 | 代码行数 | 占比 | 关键模块 |
|---|---------|------|---------|
| `packages/api` | ~25,000 | 69% | 路由、服务、持久层、测试 |
| `packages/cli` | ~3,500 | 10% | 命令行、guard 分析、structure 提取 |
| `packages/core` | ~851 | 2% | 扫描内核 (精简稳定) |
| `packages/adapters` | ~238 | 1% | 项目适配器配置 |
| `packages/ai` | ~100 | <1% | Schema 定义 |
| `packages/shared` | ~200 | 1% | 共享类型 |
| `packages/rules` | ~50 | <1% | 规则加载器 |
| `Test Files` | ~6,000 | 17% | 39 个测试文件 |

### 1.3 热点代码区域 (Top 10)

| 文件 | 行数 | 角色 | 风险评级 |
|-----|------|------|---------|
| `scan-service.test.ts` | 3,164 | 核心服务测试 | 🟡 中 |
| `artifact-parsers.test.ts` | 2,325 | Parser 测试 | 🟡 中 |
| `contract.test.ts` | 1,490 | 契约测试 | 🟢 低 |
| `openapi-artifacts/shared.ts` | 795 | OpenAPI 解析 | 🟡 中 |
| `openapi-artifacts.ts` | 697 | OpenAPI 编排 | 🟡 中 |
| `schema-artifacts.ts` | 626 | Schema 解析 | 🟡 中 |
| `recovery-repository.ts` | 464 | 恢复持久层 (预览) | 🟠 高 |
| `memory/store.ts` | 449 | 内存服务 (预览) | 🟠 高 |
| `scan-doc-contract/shared.ts` | 447 | 文档契约 | 🟢 低 |
| `attribution/store.ts` | 331 | 归因服务 (预览) | 🟠 高 |

### 1.4 架构健康度评估

| 维度 | 评分 | 说明 |
|-----|------|------|
| **分层清晰性** | ⭐⭐⭐⭐⭐ | Core/CLI/API 职责边界明确 |
| **稳定面保护** | ⭐⭐⭐⭐⭐ | 稳定面与预览面区分清晰 |
| **模块内聚性** | ⭐⭐⭐⭐☆ | 大文件已拆分，shared 层提取到位 |
| **依赖管理** | ⭐⭐⭐⭐☆ | Workspace 依赖清晰，无循环依赖 |
| **契约稳定性** | ⭐⭐⭐⭐⭐ | 多重 generated sections 守护 |

---

## 二、产品经理视角：能力矩阵与定位

### 2.1 当前能力定位

```
                    高
     ┌─────────────────────────────┐
  成 │                             │
  熟 │    ┌──────────┐             │
  度 │    │ 代码扫描  │             │
  │   │    │ 符号发现  │             │
  │   │    └──────────┘             │
  │   │                             │
  │   │              ┌──────────┐   │
  低 │              │ 接口治理  │   │
  │   │              │ 字段治理  │   │
  │   │              └──────────┘   │
  │   │                             │
  │   │                        ┌────┴───┐
  │   │                        │ 执行编排 │
  │   │                        │ 事故恢复 │  ← 预览面
  │   │                        │ 内存提案 │
  └───┘                        └────────┘
     低                        高
           战略重要性 →
```

### 2.2 能力成熟度矩阵

| 能力 | 状态 | 成熟度 | 对外承诺 |
|-----|------|--------|---------|
| AST 代码扫描 | ✅ 稳定 | 生产级 | **已承诺** |
| 符号发现 | ✅ 稳定 | 生产级 | **已承诺** |
| JSONL 输出 | ✅ 稳定 | 生产级 | **已承诺** |
| Dry-run 改写 | ✅ 稳定 | 生产级 | **已承诺** |
| OpenAPI 解析 | ✅ 稳定 | 生产级 | **已承诺** |
| Schema 解析 | ✅ 稳定 | 生产级 | **已承诺** |
| Route Evidence | ✅ 稳定 | 生产级 | 有限承诺 |
| 接口兼容性检查 | 🔄 迭代 | Beta | 不承诺完整能力 |
| 事故管理 | ⚠️ 预览 | Alpha | **不承诺** |
| 审批工作流 | ⚠️ 预览 | Alpha | **不承诺** |
| 内存提案 | ⚠️ 预览 | Alpha | **不承诺** |

### 2.3 与竞品的差异化定位

| 工具 | 定位 | los-ast 差异点 |
|-----|------|---------------|
| **ast-grep** | 通用 AST 搜索/重写 | los-ast 增加项目适配器、artifact 导出、API 服务化 |
| **Tree-sitter** | 解析基础设施 | los-ast 在其之上构建规则引擎、治理工作流 |
| **Semgrep** | 安全规则扫描 | los-ast 聚焦代码治理、接口/字段级治理 |
| **ESLint** | JS/TS 代码规范 | los-ast 跨语言、支持 Rust、Schema 治理 |

---

## 三、工程经理视角：质量与交付

### 3.1 测试覆盖分析

```
测试分布:
┌────────────────────────────────────────────────┐
│  Unit Tests       ████████████████░░░░  41%    │
│  Contract Tests   ██████░░░░░░░░░░░░░░  15%    │
│  Integration Tests ████████░░░░░░░░░░░  20%    │
│  Golden Tests     ████░░░░░░░░░░░░░░░░  10%    │
│  Smoke Tests      ███░░░░░░░░░░░░░░░░░   8%    │
│  Adapter Tests    ██░░░░░░░░░░░░░░░░░░   6%    │
└────────────────────────────────────────────────┘
```

### 3.2 质量门禁体系

| 门禁 | 命令 | 状态 |
|-----|------|------|
| Doctor (健康检查) | `npm run doctor` | ✅ 通过 |
| API Dist 新鲜度 | `npm run check:api-dist` | ✅ 有脚本 |
| Scan 生成物校验 | `npm run check:scan-generated` | ✅ 7 项校验 |
| 契约测试 | `npm run test:api:contract` | ✅ 稳定 |
| 集成测试 | `npm run test:api:integration` | ✅ 稳定 |
| Golden 测试 | `npm run test:golden` | ✅ 稳定 |
| Lsclaw 适配器 | `npm run test:lsclaw:adapter` | ✅ 稳定 |

### 3.3 技术债务热力图

| 区域 | 债务类型 | 严重程度 | 建议处理 |
|-----|---------|---------|---------|
| `experimental/*` 路由 | 预览代码膨胀 | 🟠 中 | 计划迁出到独立服务 |
| `structure-map` 复杂度 | 控制流分析边界 | 🟡 低 | 文档明确能力边界 |
| `packages/api/dist` | 受控产物管理 | 🟡 低 | 已建立门禁流程 |
| 规则包版本管理 | 缺失 manifest | 🟡 低 | 建议增加规则包清单 |

---

## 四、外部集成开发者视角：适配状况

### 4.1 已适配项目状态

| 项目 | 适配状态 | 配置位置 | 规则数量 | 活跃维护 |
|-----|---------|---------|---------|---------|
| **lsclaw** | ✅ 已适配 | `packages/adapters/src/index.mjs` | 12+ 规则 | ✅ 是 |
| **cantool** | ✅ 已适配 | `packages/adapters/src/index.mjs` | 7+ 规则 | ✅ 是 |
| **fullstackframe** | ⚠️ 基础适配 | `packages/adapters/src/index.mjs` | 1 规则 | 🔄 待扩展 |

### 4.2 lsclaw 适配详情 (主要下游)

```yaml
适配深度: 深
集成模式:
  - 稳定 API: /healthz, /scan, /discover/symbols
  - Artifact 消费: scan-findings.jsonl, symbols.json, structure-map.json
  - Smoke 测试: 3 个独立入口

契约保障:
  - Artifact Contract: docs/adapters/lsclaw-artifact-contract.md
  - Runtime Smoke: packages/api/tests/smoke/lsclaw-adapter.smoke.test.ts
  - Artifact Smoke: test/lsclaw-adapter-contract.test.mjs
```

### 4.3 适配扩展建议

| 优先级 | 项目类型 | 适配收益 | 工作量 |
|-------|---------|---------|--------|
| P1 | 更多 Node.js 后端项目 | 高 | 低 (复用 lsclaw 配置) |
| P2 | React/Vue 前端项目 | 中 | 低 (TSX 规则已存在) |
| P3 | Python/Django 项目 | 中 | 高 (需新增 parser) |
| P4 | Go 微服务项目 | 中 | 高 (需新增语言支持) |

---

## 五、开源社区视角：生态与扩展

### 5.1 规则生态现状

```
规则分布:
rules/
├── languages/          (4 种语言)
│   ├── javascript/     2 规则
│   ├── typescript/     1 规则
│   ├── tsx/            1 规则
│   └── rust/           1 规则
│
└── projects/           (4 个项目)
    ├── cantool/        7 规则
    ├── lsclaw/         2 规则
    ├── lsclaw-governance/  6 规则 + RULESET.md
    ├── lsclaw-refactor/    7 规则
    └── fullstackframe/     1 规则
```

### 5.2 扩展点设计

| 扩展类型 | 机制 | 难度 | 文档 |
|---------|------|------|------|
| 新增语言 | Tree-sitter parser 注册 | 中 | `docs/adapters/parser-capabilities.md` |
| 新增规则 | YAML 规则文件 | 低 | `docs/rules/RULE_AUTHORING.md` |
| 新增项目适配器 | `los-ast.config.json` | 低 | `README.md` |
| 新增 Parser Profile | `artifact-parsers/registry.ts` | 中 | `docs/api/artifact-parser-profiles.md` |

### 5.3 社区友好度评估

| 维度 | 评分 | 说明 |
|-----|------|------|
| 文档完整性 | ⭐⭐⭐⭐☆ | 架构、API 契约、规则编写均有文档 |
| 示例丰富度 | ⭐⭐⭐⭐☆ | Fixtures 和 golden tests 充足 |
| 贡献指南 | ⭐⭐⭐☆☆ | 有 AGENTS.md，但对外贡献流程待完善 |
| 问题追踪 | ⭐⭐⭐☆☆ | GitHub Issues 模板可加强 |

---

## 六、关键发现与优化建议

### 6.1 关键发现

1. **稳定面与预览面边界清晰**: 项目成功将约 55% 的代码隔离在预览面，保护核心稳定面不被污染
2. **契约测试体系完善**: `/scan` API 拥有 7 层 generated sections 守护，确保文档与代码不漂移
3. **Core 层极度精简**: 仅 851 行代码的 core 层是项目最稳定的部分，符合"内核"定位
4. **测试密度高**: 39 个测试文件覆盖 6 个层级，契约测试与集成测试占比 35%

### 6.2 优化建议 (按优先级)

#### P0: 架构稳定性
- [ ] 完成 `experimental/*` 迁出计划，减少预览面代码占比
- [ ] 为规则包引入 manifest 系统，支持版本化与依赖管理

#### P1: 工程效率
- [ ] 增加增量扫描缓存 (基于 mtime/hash)，降低重复扫描成本
- [ ] 为大型仓库引入异步任务模式与分页支持

#### P2: 生态扩展
- [ ] 扩展现有项目适配器 (fullstackframe 深度不足)
- [ ] 新增 2-3 个常用项目类型的默认适配器

#### P3: 体验优化
- [ ] 优化错误信息，增加修复建议
- [ ] 增加扫描结果的可视化报告 (HTML/SARIF)

### 6.3 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|-----|------|------|---------|
| 预览面代码膨胀影响稳定面 | 低 | 高 | 已建立物理隔离，继续推进迁出计划 |
| 下游项目对 artifact 契约产生过度依赖 | 中 | 中 | 文档明确能力边界，渐进式承诺 |
| Core 层功能不足导致规则表达受限 | 低 | 中 | 保持 core 精简，复杂逻辑下沉到 parser |

---

## 七、总结

`los-ast` 项目已建立起一个**架构清晰、边界明确、契约稳定**的代码治理内核。其成功之处在于：

1. **克制的产品定位**: 明确自己是"内核"而非"平台"
2. **严格的分层设计**: 稳定面与预览面物理隔离
3. **完善的契约体系**: 文档、代码、测试三位一体
4. **实际的下游验证**: 已通过 `lsclaw` 和 `cantool` 验证适配可行性

项目的下一步重点应放在：
- 完成预览面的迁出或产品化决策
- 在保持 Core 精简的前提下扩展治理能力
- 建立更完善的社区贡献与规则生态

---

*报告生成: 2026-04-01*  
*下次建议审查: 2026-04-15*
