# los-ast Active TODO

更新时间：2026-03-11

本文件是当前有效的执行清单，用于替代仓库内分散的阶段性 TODO/复盘文档。

## 当前定位

- `los-ast` 当前是代码治理与结构化扫描内核。
- 稳定能力以 `core + cli + /healthz + /scan + /discover/symbols` 为主。
- `incident / approval / memory / attribution / recovery / vps-agent-web` 仍属于预览能力，不作为长期稳定边界承诺。
- `contractArtifacts / schemaArtifacts` 已能进入统一 finding 管道；OpenAPI 与 SQL/Prisma 原生输入已完成最小接入。

## P0 本周优先级

1. 边界收口
- 明确稳定面与预览面，避免 `los-ast` 被误用为执行编排平台。
- README、配置文档、API 文档统一标注稳定/预览状态。
- 验收：新接入方只依赖稳定面即可完成集成。

2. 文档源头统一
- 以本文件作为当前执行源头。
- README 只保留入口索引，不再让 dated TODO 成为默认阅读路径。
- 验收：新读者 5 分钟内能判断“现在能做什么、不能做什么、下一步做什么”。

3. 配置基线
- 提供 `packages/api/.env.example` 作为 API 运行配置基线。
- 明确身份、scope、route flags、internal route 访问控制的最小配置。
- 验收：本地启动与灰度部署有统一示例。

## P1 近期优先级

1. 原生 contract 输入源
- 已完成 `openApiDocuments -> contract findings` 最小闭环。
- 当前覆盖 `operationId`、变更接口安全要求、成功响应声明 3 类基础检查。
- 下一步扩展到更细粒度的 schema / field 语义规则。

2. 原生 schema 输入源
- 已完成 `schemaDocuments -> schema findings` 最小闭环。
- 当前覆盖主键缺失、敏感字段可空、生命周期默认值、审计时间默认值 4 类基础检查。
- 已完成最小 `schemaComparisons -> compatibility findings` 闭环，当前覆盖字段删除、类型变化、可空性收紧、enum 值删除、默认值变化分级。
- 下一步扩展到更细的兼容性等级与方言等价规则。

3. 输入层结构收口
- 已将原生 `contract/schema` 输入解析抽到独立 parser 层，避免继续堆积到 `scan-service`。
- 已补 parser registry / profile 结构，后续新增输入源不必继续修改主 orchestration。
- 已补 parser capability metadata 与 profile-level fixtures。
- 已补 parser registry 的启停开关与 profile version/stability 元数据。
- 已补 profile 级 golden 用例。
- 下一步可继续补 parser-level release notes 与更细的 compatibility cases。

3. 规则包治理
- 为治理规则包增加版本、来源、更新时间、加载顺序约束。
- 固定 `rules/projects/lsclaw-governance/` 的组织方式。
- 验收：规则来源可追溯，规则漂移可定位。

## P2 中期优先级

1. 预览域迁移
- 将 incident / approval / recovery / memory 的长期职责迁出 `los-ast`，保留兼容层或单独服务。
- 验收：`los-ast` 回到 code intelligence kernel 的边界。

2. 存储抽象
- 将当前内存 `Map` store 改为 repository 接口，支持持久化后端替换。
- 验收：store 不再直接决定长期状态模型，测试可替换存储实现。

3. 平台化与异步化
- 为大扫描引入 async task 模式、分页与更完整的 observability。
- 验收：超过同步阈值时不再只能拒绝，可进入受控异步流程。

## 当前不承诺

- 不承诺完整的接口治理平台能力。
- 不承诺数据库字段治理已开箱即用。
- 不承诺预览域的持久化与跨重启状态一致性。
- 不承诺 `vps-agent-web` 路由组已达到长期稳定契约级别。

## 参考文档

- `README.md`
- `docs/architecture.md`
- `docs/architecture-boundary-spec.md`
- `packages/api/docs/api/API_CONTRACT.md`
- `docs/service-readiness-degradation-contract.md`
