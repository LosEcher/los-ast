# lsclaw / VPS Agent Web 治理能力落地 Stage 1 交付（2026-03-11）

## 目标

- 完成可复用治理分层入口，支撑前后端/数据库方向的代码层治理；
- 为后续 `contract` / `schema` 来源治理打下类型与响应字段基础；
- 明确当前边界与下一阶段输入源规划，避免“能力过度承诺”。

## 已交付（本阶段可验收）

1. 发现元数据增强（运行时）
   - `Finding.findingSource` 已在 core 输出中注入，默认 `ast`；
   - `Finding.governanceDomain` 已注入 `governance.domain`；
  - `Finding.impactHint` 已注入 `governance.impact`（`low|medium|high`，不合法值会在加载期回退为 `medium`）。

2. 规则治理元信息支持
   - `rules.mjs` 支持解析 `governance` 块（domain/owner/impact/rationale），兼容 string/array domain；
   - `lsclaw-governance` 规则包已创建（frontend/backend/database/interface）；
   - 规则侧新增 `governance` 示例字段，可直接用于 `lsclaw`/VPS Agent Web 分层消费。

3. 契约与文档对齐
   - API 契约文档注明治理字段含义与 `ast` 默认行为；
   - API 使用文档补充治理可观测字段；
   - OpenAPI schema 增补 finding 新字段；
   - 规则编写规范加入治理元信息；
   - 新增治理范围 TODO 与规则模板说明。

## 关键验收点

- [x] `/scan` 返回 finding 里包含治理来源字段（至少默认 `findingSource=ast`）；
- [x] 规则可声明 `governance` 元信息且不破坏现有扫描语义；
- [x] 文档可明确“当前支持/不支持”的边界；
- [x] 新增治理规则目录可被扫描加载（路径约定已确定）。

## 风险与待改进

- 当前 `contract/schema` 还未形成独立输入源，仅有字段预留；
- 部分规则为起步版，需逐步收敛减少误报；
- 下一阶段应补 `lsclaw-governance` 的最小 fixture 回归与阈值策略（`low/medium/high` 生效监控）。

## Stage 2 计划（直接对齐）

1. 建立字段契约输入（OpenAPI/IDL/Schema）并产出 `findingSource='contract'`；
2. 建数据库元模型输入（SQL/ORM/DDL）并产出 `findingSource='schema'`；
3. 建最小规则治理验收套件（每个 domain 至少一条稳定规则）；
4. 与 lsclaw 对齐 `policy.routeIntent` 与 `tags` 跟踪，形成治理闭环。
