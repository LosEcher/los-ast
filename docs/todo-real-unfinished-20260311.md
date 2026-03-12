# los-ast 真实未完成待办（2026-03-11）

状态：阶段记录。当前执行顺序与能力边界以 `docs/ACTIVE_TODO.md` 为准；本文件保留 2026-03-11 当天的复核证据与中期迁移事项。

## 范围说明

本清单仅保留“代码/测试/文档中仍未收口”的事项；已完成项不重复列入。  
所有项都以「可验证证据」为准，优先以测试结果和文档链接复核。

基线验证（2026-03-11）：
- `npm run test` 通过（119/119）
- `cd packages/api && npm run typecheck` 通过

---

## 状态总览

- `P0-1` 已完成：生产态 `scope` 权威来源改为 JWT claims 派生，并加入 `SCOPE_TAMPERED` 检测。
- `P0-2` 已完成：身份配置补齐（`JWT_SECRET`、`LSCLAW_JWT_SECRET`、`EVIDENCE_SIGNING_KEY`、`DEV_ALLOW_UNVERIFIED_IDENTITY`）并在启动日志打印身份状态。
- `P0-3` 已完成：`/experimental/evidence/:id` 读取按租户/项目校验，证据记录包含 `scope` 归属。
- `P0-4` 已完成：审批写路径清理 `actor_id: 'system'` 占位写法，使用 `scope.actor_id` 注入。
- `P1-1` 已完成：契约与示例已收口为“`Authorization` 主路径、`scope` 服务端派生 + 兼容回退”。
- `P1-2` 已完成：身份门禁、防篡改测试及 smoke 已迁移为主路径授权调用。
- `P1-3` 已完成：配置校验增强（Zod）已完成并补齐校验测试。
- `P1-4` 已完成：Cancellation 插件去重重构落地，scan/discover 已使用 `withCancellation` 统一语义。
- `P1-5` 已完成：Core 未就绪显式降级（`503 SERVICE_UNAVAILABLE`, `CORE_NOT_READY`）已在扫描与符号发现链路接入并有验证。
- `P2*` 未完成：迁移与平台化验收项持续推进。  
- `P2-3` 已开始补齐：性能与平台化验收脚本已落地，可复现报告可追溯。

---

## 剩余待办（要点 + 复核关键点）

### P1（两周内完成）

1. 当前无新增 P1 剩余项
- `P1-3` 配置校验增强（Zod）已完成，落地于 `packages/api/src/config/index.ts` 与 `packages/api/tests/unit/config/config-validation.test.ts`。
- `P1-4` Cancellation 插件去重重构已完成，`scan/discover` 已统一使用 `withCancellation`。
- 当前短期执行应回到 `docs/ACTIVE_TODO.md` 中的文档边界收口、`route_runtime_deltas` 细化与规则包治理。

### P2（里程碑迁移项）

1. P2-1 控制面职责迁移
- 要点：
  - `incident/approval/recovery` 长期职责迁移到 `VPS Agent Web`。
  - attribution provider 治理迁移到 `lsclaw`。
- 复核关键点：
  - 路由分层、注册表与文档状态一致。
  - 迁移兼容期与降级方案有明确截止时间。

2. P2-2 存储层演进（内存 Map -> 持久化）
- 要点：
  - 定义持久化模型、索引与迁移路径。
  - 明确持久化边界（实验数据/核心证据/缓存）。
- 复核关键点：
  - 重启后数据一致性可验证。
  - 读写隔离与租户边界在持久化后仍成立。

3. P2-3 性能与平台化验收
- 要点：
  - 24h 泄漏压测、>10k 文件扫描基准、覆盖率与契约冻结窗口。
- 复核关键点：
  - 所有指标有可复现脚本与产物。
  - 关键性能报告可在 CI/交付中追溯。
  - 24h 漏测与内存基线、覆盖率冻结窗口需要独立排程补齐。

#### P2-3 复核进展（2026-03-11）
- 已补齐：
  - 新增 `packages/api/scripts/scan-benchmark.ts`，支持 `--files/--iterations/--concurrency/--rules/--output` 参数。
  - 默认对 10k+文件场景自动放宽 `MAX_FILES_PER_SYNC_SCAN`（可配置），并生成 JSON 报告。
  - 新增 `benchmark:scan` 命令用于一键执行。
- 已执行（本轮）：
  - `cd packages/api && npm run benchmark:scan -- --files 10000 --iterations 3 --concurrency 2 --output ../logs/scan-benchmark-20260311.json`
  - 报告：`logs/scan-benchmark-20260311.json`
  - 成功率：`3/3`
  - 延迟：p50=1106.41ms，p95=1106.55ms，p99=1106.55ms
  - 吞吐：`1.69 req/s`
- 待补齐：
  - 24h 泄漏压测（`abort`、`heap`、`event-loop lag`）与长期基线回归门禁。

---

## 本轮验收（2026-03-11）

### 证据与复核结果
- `npm run test -- --run tests/smoke/lsclaw-adapter.smoke.test.ts`：PASS（2/2）
- `npm run test -- --run tests/integration/identity-gate.integration.test.ts`：PASS（4/4）
- `npm run test -- tests/unit/plugins/cancellation.test.ts`：PASS（2/2）
- 文档收口：`API_USAGE.md`、`docs/api/openapi.yaml`、`docs/api/vps-agent-web-contract-checklist.md`、`docs/api/vps-agent-web-examples-errors.md`、`docs/API_CONTRACT.md` 已同步。

### 当前风险提示（开发）
- 开发环境默认 `DEV_ALLOW_UNVERIFIED_IDENTITY=false`，未配置该开关时可能触发 401；需在开发手册与启动说明中保持可见。
- 兼容期 scope 来源仍支持 query/body fallback，若有依赖方继续发送不一致 scope，仍可能触发 `SCOPE_TAMPERED`；需要客户端升级窗口期管理。

### 建议执行顺序（最小闭环）

1. 以 `docs/ACTIVE_TODO.md` 为唯一执行源，先完成文档/边界收口。
2. 同步补齐压测与稳定性复核证据，再推进 P2 独立里程碑。

### 下一阶段（2026-03-11 继续）

#### 阶段目标
- 将当前“输入源（contract/schema）已接入参数”转成“可交付治理能力”：
  - 形成可复用规则包输入规范（规则源版本 + 组织元信息）。
  - 完成最低可用的治理输入流水线（至少可从 OpenAPI/Schema 文件映射为 artifact）。

#### 本阶段待办（优先级）
1. [ ] 规则治理包化（第二步）
   - 固定 `lsclaw-governance` 的版本声明、加载顺序与规则来源可追溯说明。
   - 最小整包 fixtures 基线已完成：`fixtures/golden/lsclaw-governance-pack/` + `test/rules.test.mjs`。
   - 补“规则来源可追溯”证据（规则包版本、更新时间、回归入口）。
2. [ ] OpenAPI/IDL 入口最小实现
   - 支持 `contractArtifacts` 的可重复转换路径，避免上游重复上报同一 finding。
   - 已补契约/集成用例：contract 与 schema 同时存在时字段不串通道。
3. [ ] Schema 入口最小实现（阶段化）
   - 支持基础 SQL/Prisma 元信息提取样例（字段 nullable/类型/主键一致性线）。
   - 输出 `findingSource=schema`，并记录 `governanceDomain/impactHint`。

#### 阶段验收
- [x] `contract test` 与 `integration test` 中 contract/schema 来源路径各至少 1 条验收用例稳定通过。
- [x] `docs` 中明确：当前可支持项目层（代码治理）能力边界与“接口/字段治理”的排期；执行源已收口到 `docs/ACTIVE_TODO.md`。
- [x] 产出 1 份阶段演进证明（包含执行脚本/输出路径）并进入 P2 追踪：`docs/governance/stage2-governance-verification-20260311.md`
