# 四项目协同待办

## 目的

把 `los-ast` 当前需要补的集成待办登记下来，并给出 `los-ast`、`los-memory`、`lsclaw`、`VPS Agent Web` 的协同开发方式，避免边改边漂移。

## 当前判断

- `los-ast` 的目标边界没有问题：代码事实、结构证据、影响分析。
- 当前实现尚未完全收口到该边界：
  - `scope` 仍由客户端直接提供，缺少权威身份源。
  - `incident` / `approval` / `attribution` / `recovery` 仍有控制面职责残留。
  - 对外文档仍把 `scope` 当成正式输入契约。
  - 审计身份、证据签名、跨系统 trace 还未统一。

## los-ast Todo

### P0 身份与证据基线

- [ ] 新增 `identity` 插件，生产环境强制 JWT，开发环境仅在显式开关下允许 `X-Identity-*` 头。
- [ ] 将 `request.scope` 改为由已验证身份派生，不再信任 body/query 提供的 `scope`。
- [ ] 为 `CodeEvidenceBundle` 增加签名字段，并记录 `signed_by`、`signed_at`、`fingerprint`。
- [ ] 在 evidence 路由强制校验“请求 scope 与身份一致”，不一致直接拒绝。
- [ ] 为所有写路径补 `actor_id` 注入，移除 `system` 这类占位写法。
- [ ] 环境变量补齐：`JWT_SECRET` / `LSCLAW_JWT_SECRET` / `EVIDENCE_SIGNING_KEY` / `DEV_ALLOW_UNVERIFIED_IDENTITY`。

### P1 契约与边界收口

- [ ] 更新 `packages/shared` 的 `Scope` 类型，区分 `VerifiedScope` 与开发态 scope。
- [ ] 在跨服务契约中补齐 `trace_id`、`request_id`、`role`、`identity source`。
- [ ] 更新 OpenAPI、`API_CONTRACT.md`、`VPS Agent Web` 文档，改为“身份走 header，scope 为服务端派生上下文”。
- [ ] 审核 `incident` / `approval` / `attribution` / `recovery` 路由，标记哪些仅为过渡层，哪些需要迁出。
- [ ] 明确 `los-ast` 对外稳定面只承诺：
  - `/scan`
  - `/discover`
  - `evidence` 相关事实/证据接口

### P1 测试与回归门禁

- [ ] 增加 `identity-verification` 集成测试，覆盖无身份、合法 JWT、scope 篡改三类场景。
- [ ] 增加 evidence 签名验签测试。
- [ ] 更新 smoke 测试，不再通过 body/query 直传正式 `scope`。
- [ ] 为 `VPS Agent Web` 镜像前缀补“身份透传 + 作用域隔离”回归测试。

### P2 控制面剥离

- [ ] 把 `incident` / `approval` / `recovery` 的长期职责迁移到 `VPS Agent Web`。
- [ ] 把 `attribution` 的 provider 治理、路由策略、预算控制迁移到 `lsclaw`。
- [ ] `los-ast` 保留分析内核和事实证据输出，不保留工作流主记录。
- [ ] 为迁移期保留兼容层，但标注 sunset 时间和下线条件。

## 四项目协同开发方式

### 1. 职责切分

- `los-ast`
  - 负责代码扫描、结构化事实、证据包、影响分析、rewrite 候选。
  - 不负责审批主流程、审计主记录、长期记忆入账、路由治理。
- `los-memory`
  - 负责长期账本、纠错事实、经验沉淀、入账规则。
  - 不直接采信 `los-ast` 原始输出，必须通过审批或验证流。
- `lsclaw`
  - 负责身份、路由、策略、provider 治理、预算和调用追踪标准化。
  - 作为 `los-ast` 的权威身份上游。
- `VPS Agent Web`
  - 负责任务编排、执行控制面、审批、审计展示、人工闭环。
  - 作为用户入口和跨能力聚合层。

### 2. 统一契约先行

先冻结一份跨项目公共契约，再并行开发，避免四边同时改接口：

- `IdentityContext`
  - `tenant_id`
  - `project_id`
  - `actor_id`
  - `role`
  - `trace_id`
  - `request_id`
  - `source`
  - `verified`
- `EvidenceEnvelope`
  - `bundle`
  - `signature`
  - `issuer`
  - `schema_version`
- `MemoryCommitRequest`
  - `proposal_id`
  - `approval_id`
  - `approved_by`
  - `evidence_refs`
  - `scope`

建议 owner：

- `IdentityContext`: `lsclaw` + `los-ast`
- `EvidenceEnvelope`: `los-ast`
- `MemoryCommitRequest`: `los-memory` + `VPS Agent Web`

### 3. 开发顺序

按依赖方向推进，不要四个仓库同时无序改：

1. `lsclaw` 先产出 JWT/identity 规范和测试 token 生成器。
2. `los-ast` 接入 identity、证据签名、契约收口。
3. `VPS Agent Web` 改为透传身份、消费已签名 evidence、承接审批与审计。
4. `los-memory` 最后收口 commit 接口，只接受带审批依据的写入。

### 4. 联调模式

- 使用单独 `integration` 测试账号，不带项目敏感上下文。
- 每个仓库保留自己的单测/集成测，同时加一条跨仓 smoke：
  - `VPS Agent Web -> lsclaw -> los-ast`
  - `VPS Agent Web -> los-memory`
  - `approval passed -> memory commit`
- 所有跨服务请求必须带：
  - `Authorization: Bearer <jwt>`
  - `X-Request-ID`
  - `X-Trace-ID`

### 5. 变更治理

- 所有跨项目接口变更先改契约文档，再改代码，再改 smoke。
- 每个接口字段要有单一 owner，禁止多仓分别解释。
- 迁移期允许兼容层，但必须记录：
  - 新旧接口
  - 默认路由
  - 下线时间
  - 回滚方案

## 建议的联动里程碑

### M1 身份可信

- `lsclaw` 能签发 JWT。
- `los-ast` 只接受受信身份。
- `VPS Agent Web` 能透传身份。

### M2 证据可信

- `los-ast` 输出带签名 evidence。
- `VPS Agent Web` 展示 evidence 来源和签名状态。
- `lsclaw` 在调用记录中关联 `trace_id` 与 evidence。

### M3 审批闭环

- `VPS Agent Web` 持有审批流。
- `los-memory` 仅接受带审批依据的 commit。
- `los-ast` 不再直接承担审批/控制面语义。

### M4 边界固化

- 文档、OpenAPI、测试、环境变量、路由前缀全部完成收口。
- 过渡接口标记 sunset，准备下线。

## 本周建议动作

1. 先在 `los-ast` 完成 P0 身份与证据基线，不再新增任何基于 body/query 直传 scope 的接口。
2. 让 `lsclaw` 出一版 JWT claims 草案和本地联调签发脚本。
3. 让 `VPS Agent Web` 明确审批记录与审计记录的数据模型 owner。
4. 让 `los-memory` 定义“可入账”的最小提交凭证，不接受裸 proposal 直接 commit。
