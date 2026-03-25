# los-ast Active TODO

更新时间：2026-03-25

本文件是当前有效的执行清单，用于替代仓库内分散的阶段性 TODO/复盘文档。

## 当前定位

- `los-ast` 当前是代码治理与结构化扫描内核。
- 稳定能力以 `core + cli + /healthz + /scan + /discover/symbols` 为主。
- 面向 `lsclaw` 的稳定配合面当前还包括三条独立 smoke 脚本：`test:lsclaw:adapter:artifacts`、`test:lsclaw:adapter:runtime`、`test:lsclaw:adapter`。
- `incident / approval / memory / attribution / recovery / vps-agent-web` 仍属于预览能力，不作为长期稳定边界承诺。
- `contractArtifacts / schemaArtifacts` 已能进入统一 finding 管道；OpenAPI 与 SQL/Prisma 原生输入已完成最小接入。
- `structure-map.json` 当前适合做“结构盘点 / 热点排序 / 边界证据”。
- `structure-map.json` 已支持最小 Fastify 静态证据提取，可覆盖字面量 `register(..., { prefix })`、`get/post/...` 注册链，以及部分 prefix alias / 模板字符串、同函数 control-flow guard、`else / else if` 分支、带外层括号的简单布尔组合，以及同文件单-return helper gate 转发。
- `structure-map.json` 仍不适合作为完整“route truth 真源”：更复杂布尔表达式、helper 转发、多框架场景仍需依赖运行时注册、OpenAPI、集成测试或人工证据交叉验证。
- 当前阶段验收说明：`docs/hub-lite-route-evidence-acceptance.md`
- 当前阶段标记：`docs/status/hub-lite-route-evidence.phase.json`
- 如调整 `hub-lite:artifacts` 的文件名或 `structure-map.json` 顶层字段，需同步更新 `docs/adapters/lsclaw-artifact-contract.md` 并通知 `lsclaw` bump pin。

## P0 本周优先级

0. 审查收口（2026-03-12）
- [x] 把本轮项目审查发现补入当前有效 TODO，而不是散落在会话结论里。
- [x] 收紧 `incident / attribution / recovery` 预览路由的 scope 边界，统一以 `request.scope` 作为租户/项目真源，避免继续信任 query/body 里的 forged scope。
- [x] 为 `recovery action` 补齐最小 `scope` 归属字段，并对 action 列表/详情/审批/回滚按 scope 过滤。
- [x] 修复 `memory proposal -> activate` 链路中“规范化入库后又用原始 content 回写”的一致性问题，避免 `lesson_id/recipe_id` 缺失时写入 `undefined` 键。
- [x] 为 `packages/api` 补齐显式 workspace 依赖声明，避免当前依赖根仓环境兜底。
- [x] `/scan` 已完成第一阶段定义收口：代码内请求体类型与 Fastify schema 已汇总到统一 `scan-contract` 模块，文档改为引用代码真源。
- [x] `/scan` 已完成第二阶段防漂移校验：OpenAPI 与 API_CONTRACT 的关键字段集合已有契约测试保护。
- [x] `/scan` 已完成第三阶段机器参考产物：新增可生成/校验的 `scan-contract-reference.json`，给后续自动生成文档打底。
- [x] `/scan` 已完成第四阶段 OpenAPI 片段半自动同步：新增 `scan-openapi-components.yaml` 生成片段与同步脚本，主 `openapi.yaml` 已由生成块嵌入。
- [x] `/scan` 已完成第五阶段 API_CONTRACT 半自动同步：请求/响应字段总览已改为生成片段，并由校验脚本守护。
- [x] `/scan` 已完成第六阶段 API_CONTRACT 示例半自动同步：Example Request / Example Success Response 已切到生成片段，并补齐 finding 治理字段示例。
- [x] `/scan` 已完成第七阶段运行约束收口：ErrorCategory、错误码表、限制说明已切到生成片段，并修正 OpenAPI 中的 `401/408/413` 漂移。
- [x] `/scan` 已完成第八阶段治理范围与 CLI/API parity 收口：Governance Scope Note 和 CLI/API Parity 已切到生成片段并有契约测试守护。
- [x] `/scan` 已完成第九阶段稳定性说明收口：Version Stability Guarantee、Deterministic Output 与 Testing 已切到生成片段并有契约测试守护。
- [x] `/scan` 文档、OpenAPI 与共享类型已继续收口到同一参考源：
  - OpenAPI `/scan` operation 的 `description`、request examples 与 error examples 已改为从 `scan-doc-contract` 生成。
  - API_CONTRACT 的 Example Request 已复用同一请求示例真源，避免 OpenAPI/API_CONTRACT 示例继续双写。
- [x] `export-artifacts.mjs` 与 `evidence/service.ts` 大文件热点已继续拆分：
  - `evidence/service.ts` 已抽出 `builders.ts`，把 bundle/rewrite/explain 的纯构造逻辑移出 service orchestration。
  - `cli/index.mjs` 与 `export-artifacts.mjs` 已抽出共享 `workspace-options.mjs`，先收口重复的 workspace/rules 解析。
  - `export-artifacts.mjs` 已继续抽出 `route-guard-analysis.mjs`，把 control-flow guard / route activation 的纯分析逻辑从 CLI shell 中分离。
  - `export-artifacts.mjs` 已继续抽出 `source-structure-extractor.mjs`，把 source facts / route topology 的静态提取逻辑移出 CLI shell。

0. 审查收口（2026-03-13）
- [x] 统一仓库根目录与 `packages/api` 的 `.env.example` 默认值与变量集，避免 `DEV_ALLOW_UNVERIFIED_IDENTITY` 等开发安全基线漂移。
- [x] 刷新 `hub-lite route evidence` 阶段状态文档中的测试文件数、测试数与复核日期，避免“仓库已变更但阶段基线仍停留在旧值”。
- [x] 将 `evidence` 代码统计从硬编码占位值改为基于项目适配器 workspace 的真实统计，并补回归测试覆盖。
- [x] `README` / `docs` 已补“新读者阅读顺序 + 稳定契约入口”收口，先把首次阅读路径压缩到 `ACTIVE_TODO -> README 稳定面/预览面 -> architecture/API_CONTRACT`。
- [x] `/scan` 的 OpenAPI operation 文案、request examples 与 error examples 已切到 `scan-doc-contract` 共享真源，并由契约测试守护。
- [x] `export-artifacts.mjs` 已抽出 `source-structure-extractor.mjs`，把 source facts / route topology 静态分析从 CLI orchestration 中分离。
- [x] `route_binds` 的边界措辞已在 README、执行清单、集成说明和导出 summary 中统一为“minimal Fastify literal-only runtime-like bind evidence, not full route truth”。

0. 审查执行（2026-03-25，多角色视角）
- [x] 平台 / 质量：将 `lsclaw` 下游稳定契约检查纳入默认质量门；其中 runtime smoke 继续复用 `packages/api/tests/smoke`，artifact contract 进入仓库级默认 `test` 与 CI。
- [x] 开发体验：把 `doctor` 从“伪 lint”语义中拆出，改为显式 `doctor` 入口；`lint` 仅保留兼容别名，避免继续误导新贡献者。
- [x] 架构 / 交付：明确 `packages/api/dist` 继续作为受控运行时产物提交；README 已补“runtime probe / Docker / production start 共用该产物，影响运行时行为的改动需同变更刷新 `dist`，最低校验基线为 `build:api + check:api-dist + quality-gate`”，并已补仓库脚本与 CI freshness gate。
- [x] 产品 / 集成：README 已补“稳定 API / artifact contract”与“下游稳定配合面”的区别，明确 `lsclaw` artifact contract 需要单独守护，但这不等于把整套预览路由提升为稳定面。
- [x] 测试 / 可维护性：已为 `openapi-artifacts/shared.ts`、`schema-artifacts/shared.ts` 与 `route-guard-analysis/shared.mjs` 补窄测试入口，减少后续 shared 层回归只能依赖大集成测试定位。
- [x] 稳定面结构收口：`packages/api/src/services/memory/store.ts` 已完成第一阶段拆分；幂等 key、typed content 标准化、scope 可见性与激活逻辑已抽到 `packages/api/src/services/memory/shared.ts`，并补 `memory-store-shared.test.ts` 做窄回归。
- [x] CLI 结构收口：`packages/cli/src/source-structure-extractor.mjs` 已完成第一阶段 helper 下沉；route path/tier/activation、import/reexport/static expression 解析与模块解析已抽到 `packages/cli/src/source-structure-extractor/shared.mjs`，并补 `source-structure-extractor-shared.test.mjs` 做窄回归。
- [x] CLI 导出收口：`packages/cli/src/export-artifacts.mjs` 已完成第二阶段 helper 下沉；参数解析、route runtime delta 归一、structure-map / summary 组装已抽到 `packages/cli/src/export-artifacts/shared.mjs`，并补 `export-artifacts-shared.test.mjs` 做窄回归，同时已纳入 `test:core`。
- [x] 质量门收口：`hub-lite-artifacts.test.mjs` 已纳入仓库默认 `test`，让 CLI 稳定导出面与 `structure-map` 运行时探针回归不再只靠手动点测。
- [x] API 结构收口：`packages/api/src/services/scan-service.ts` 已完成第一阶段 helper 下沉；artifact finding 归一、range/fingerprint/governance 处理、native input 计数与 telemetry 拼装已抽到 `packages/api/src/services/scan-service/shared.ts`，并补 `scan-service-shared.test.ts` 做窄回归。
- [x] 持久层结构收口：`packages/api/src/persistence/repositories/approval-repository.ts` 已完成第一阶段 helper 下沉；query/stats/expired filter/JSON parse 逻辑已抽到 `packages/api/src/persistence/repositories/approval-repository/shared.ts`，并补 `approval-repository-shared.test.ts` 做窄回归。
- [x] 持久层结构收口：`packages/api/src/persistence/repositories/recovery-repository.ts` 已完成第一阶段 helper 下沉；action query/whereClause/stats 与 action/policy JSON parse 逻辑已抽到 `packages/api/src/persistence/repositories/recovery-repository/shared.ts`，并补 `recovery-repository-shared.test.ts` 做窄回归。
- [x] 配置结构收口：`packages/api/src/config/index.ts` 已完成第一阶段 helper 下沉；schema/normalize/derive 逻辑已抽到 `packages/api/src/config/shared.ts`，并补 `config-shared.test.ts` 做窄回归，同时保持 `DEFAULT_SCAN_LIMITS` 等稳定导出不变。
- [x] Core 结构收口：`packages/core/src/runner.mjs` 已完成第一阶段 helper 下沉；timestamp/excerpt/replacement/constraint/fingerprint/edit overlap/parse failure summary 逻辑已抽到 `packages/core/src/runner/shared.mjs`，并补 `runner-shared.test.mjs` 做窄回归。
- [x] 稳定符号发现面收口：`packages/api/src/services/symbol-service.ts` 已完成第一阶段 helper 下沉；AST symbol rule、文本回退提取、limit/abort/截断分段逻辑已抽到 `packages/api/src/services/symbol-service/shared.ts`，并补 `symbol-service-shared.test.ts` 做窄回归。
- [x] 文档契约真源收口：`packages/api/src/routes/core/scan-doc-contract.ts` 已切成稳定 re-export 入口；reference / overview / example 常量已抽到 `packages/api/src/routes/core/scan-doc-contract/shared.ts`，并补 `scan-doc-contract-shared.test.ts` 做窄回归。
- [x] Schema 契约真源收口：`packages/api/src/routes/core/scan-contract.ts` 已切成稳定 re-export 入口；request key、native input schema 与 response schema 真源已抽到 `packages/api/src/routes/core/scan-contract/shared.ts`，并补 `scan-contract-shared.test.ts` 做窄回归。
- [x] 基础持久层收口：`packages/api/src/persistence/key-value-store.ts` 已完成第一阶段 helper 下沉；文件路径/临时文件/隔离文件命名、payload envelope 解析、sqlite count 与 JSON 归一、runtime backend 选项解析已抽到 `packages/api/src/persistence/key-value-store/shared.ts`，并补 `key-value-store-shared.test.ts` 做窄回归。
- [x] 事故持久层收口：`packages/api/src/persistence/repositories/incident-repository.ts` 已完成第一阶段 helper 下沉；query filter/sort/paginate、sqlite whereClause、scoped stats/status counts 与 incident payload parse 已抽到 `packages/api/src/persistence/repositories/incident-repository/shared.ts`，并补 `incident-repository-shared.test.ts` 做窄回归。
- [x] `/scan` 路由编排收口：`packages/api/src/routes/core/scan.ts` 已完成第一阶段 helper 下沉；rule-pack path 解析、native/code-scan 判定与请求体验证已抽到 `packages/api/src/routes/core/scan/shared.ts`，并补 `scan-shared.test.ts` 做窄回归。
- [x] `/discover/symbols` 路由编排收口：`packages/api/src/routes/core/discover.ts` 已完成第一阶段 helper 下沉；route schema 与 request 归一/校验逻辑已抽到 `packages/api/src/routes/core/discover/shared.ts`，并补 `discover-shared.test.ts` 做窄回归。
- [x] 恢复服务收口：`packages/api/src/services/recovery/store.ts` 已完成第一阶段 helper 下沉；审批判定、停机估算、scope 检查、执行状态变更与模拟执行逻辑已抽到 `packages/api/src/services/recovery/shared.ts`，并补 `recovery-store-shared.test.ts` 做窄回归。
- [x] 生成物治理：已新增聚合检查 `check:scan-generated`，并接入 CI freshness job；后续若改动 `scan-contract` / `scan-doc-contract` 真源或同步脚本，需显式校验 generated reference、OpenAPI blocks 与 `API_CONTRACT` 片段不漂移。
- [x] 文档治理：仍标注 `READY FOR IMPLEMENTATION` 的历史路线图 / 设计文档已改为“历史参考”，并显式回指 `docs/ACTIVE_TODO.md`，避免执行入口再次分叉。
- [x] 核心实现：`route-guard-analysis.mjs`、`openapi-artifacts.ts`、`schema-artifacts.ts` 三个热点文件已完成第一阶段拆分，优先把通用解析/归一逻辑沉到 shared 层，而不是继续扩预览路由面。
  - 已完成第一步：`openapi-artifacts.ts` 的 OpenAPI 文档解析、schema 归一与 comparable shape 计算已抽到 `packages/api/src/services/openapi-artifacts/shared.ts`，主文件收口为 finding 生成编排。
  - 已完成第二步：`schema-artifacts.ts` 的格式推断、SQL/Prisma 实体解析与默认值等价归一已抽到 `packages/api/src/services/schema-artifacts/shared.ts`，主文件收口为 document/comparison finding 编排。
  - 已完成第三步：`route-guard-analysis.mjs` 的布尔表达式展开、helper/alias 解析与函数作用域扫描已抽到 `packages/cli/src/route-guard-analysis/shared.mjs`，主文件收口为 route guard / registration / activation 产物编排。
- [ ] 下一阶段：如继续做结构收口，优先针对 shared 层补更细回归覆盖，或评估剩余仍偏大的稳定面热点；不要转去继续扩预览路由功能。

1. route_binds 能力边界收口
- 明确当前 `route_binds` 是“最小 Fastify literal-only runtime bind”，不是全量 route truth。
- 下游使用说明中区分三类用途：
  - 结构盘点：可直接使用。
  - 热点排序：可直接使用。
  - 路由绑定证据：可用于 Fastify 字面量注册链。
  - 完整 route truth：当前仍标记为 `derived-only / partial`。
- 验收：README、执行清单、集成说明对 `route_binds` 能力边界表述一致。

2. 边界收口
- 明确稳定面与预览面，避免 `los-ast` 被误用为执行编排平台。
- README、配置文档、API 文档统一标注稳定/预览状态。
- 验收：新接入方只依赖稳定面即可完成集成。

3. 文档源头统一
- 以本文件作为当前执行源头。
- README 只保留入口索引，不再让 dated TODO 成为默认阅读路径。
- 验收：新读者 5 分钟内能判断“现在能做什么、不能做什么、下一步做什么”。

4. 配置基线
- 提供 `packages/api/.env.example` 作为 API 运行配置基线。
- 明确身份、scope、route flags、internal route 访问控制的最小配置。
- 验收：本地启动与灰度部署有统一示例。

## P1 近期优先级

1. 原生 contract 输入源
- 已完成 `openApiDocuments -> contract findings` 最小闭环。
- 已完成最小 `openApiComparisons -> contract compatibility findings` 闭环，当前覆盖 operation 删除、请求字段删除/类型变化/必填新增、success response 状态码删除、响应字段删除/类型变化、响应 required -> optional 变化。
- 已补本地 `#/components/schemas/*` 与简单 `allOf` 合并后的 comparison 识别。
- 已补 `oneOf/anyOf` 分支中公共字段的最小 comparison 归一，当前 request/response 都有回归覆盖，且支持配合本地 `#/components/schemas/*` 使用。
- 已补 object 嵌套路径与 `array.items` 路径的 request/response comparison 识别，如 `request.profile.age`、`response[200].users[].id`。
- 已有回归覆盖嵌套路径里的本地 `$ref`、简单 `allOf` 与 `oneOf` 数组项组合场景。
- 已补 `additionalProperties` map-like object 路径识别，如 `request.metadata.*`、`response[200].profiles.*.id`。
- 已补最小值语义 comparison：`nullable` 收紧、`enum` 值删除、`default` 删除/变更。
- 已补对应 OpenAPI value-semantics golden fixture，固定输出顺序与规则面。
- 已补最小 `discriminator` comparison：`propertyName` 变化与 mapping 值删除。
- 已补 `discriminator` golden fixture 与综合 OpenAPI comparison fixture。
- 已显式固定同位置多来源 finding 的 deterministic 排序为 `ast -> contract -> schema`。
- 已同步 core/evidence 输出类型中的 `findingSource / governanceDomain / impactHint / diff / applied` 字段声明。
- 已补 parser capability matrix 与 finding attribution 说明文档。
- 响应 comparison 当前已按 success status/default 对齐，避免 `200` 与 `201` 被误当同一 response shape 比较。
- 下一步扩展到更细粒度的 schema / field 语义规则与 `$ref` 展开。

2. 原生 schema 输入源
- 已完成 `schemaDocuments -> schema findings` 最小闭环。
- 当前覆盖主键缺失、敏感字段可空、生命周期默认值、审计时间默认值 4 类基础检查。
- 已完成最小 `schemaComparisons -> compatibility findings` 闭环，当前覆盖字段删除、类型变化、可空性收紧、新增必填字段无 default、enum 值删除、默认值变化分级。
- 已补时间默认值函数与常见 UUID 默认值函数的最小等价归一（如 `CURRENT_TIMESTAMP` / `now()`、`uuid_generate_v4()` / `gen_random_uuid()`、Prisma `uuid()` / `dbgenerated("gen_random_uuid()")`）。
- 已补主键变化、字段/组合唯一键 drift comparison，以及“新增必填字段但带 default”的降级提示。
- 下一步扩展到更细的兼容性等级与方言等价规则。

3. 输入层结构收口
- 已将原生 `contract/schema` 输入解析抽到独立 parser 层，避免继续堆积到 `scan-service`。
- 已补 parser registry / profile 结构，后续新增输入源不必继续修改主 orchestration。
- 已补 parser capability metadata 与 profile-level fixtures。
- 已补 parser registry 的启停开关与 profile version/stability 元数据。
- 已补 profile 级 golden 用例。
- 已支持 native-only `contract/schema` 请求绕过 AST 扫描主链；`rootDir` 仅在代码扫描时必填。
- 已补 native parser 产物与 passthrough artifact 的去重，避免相同 finding 双计数。
- 已补 AST parse-failure stats，可在 `includeStats=true` 时观察被跳过的解析失败文件。
- 已补 parse-failure telemetry 聚合：`sampleLimit`、`byLanguage` 与统一 Markdown 展示已收口。
- 已将 output JSON schema 的机器契约抽到 `packages/ai/src/output-schema-spec.mjs`，并由合同测试校验生成结果与落盘 schema 一致。
- 已补 `/scan` 结构化 telemetry：`durationMs`、执行模式、规则模式计数、native input 计数，当前在 `includeStats=true` 时返回。
- 已完成 `/scan` 第一阶段代码真源收口：
  - `scan.ts` 不再维护独立 `ScanRequestBody` 副本。
  - `scan-schema.ts` 改为复用统一 `scan-contract` 结构定义。
  - API 文档已补“代码真源”说明，避免文档继续成为首个定义来源。
- 已完成 `/scan` 第二阶段防漂移基线：
  - `docs/api/openapi.yaml` 已修正 `scope/rootDir/deterministic` 的实际契约漂移。
  - `packages/api/tests/contract/cli-api-parity.test.ts` 已直接校验 OpenAPI 与 `scan-contract` 的关键字段集合一致。
- 已完成 `/scan` 第三阶段机器参考产物：
  - 新增 `packages/api/scripts/generate-scan-contract-reference.ts`。
  - 新增 `packages/api/docs/api/generated/scan-contract-reference.json`。
  - 已补 `generate:scan-contract-reference` / `check:scan-contract-reference` 脚本。
- 已完成 `/scan` 第四阶段 OpenAPI 半自动同步：
  - 新增 `packages/api/scripts/sync-scan-openapi-components.ts`。
  - 新增 `docs/api/generated/scan-openapi-components.yaml`。
  - `docs/api/openapi.yaml` 中 `ScanRequest / ScanResponse` 已切到 `@generated` block，同步来源为 `scan-contract`。
  - 契约测试已校验主 OpenAPI 文档实际嵌入的生成片段与生成文件一致。
- 已完成 `/scan` 第五阶段 API_CONTRACT 半自动同步：
  - 新增 `packages/api/scripts/sync-scan-api-contract-sections.ts`。
  - 新增 `packages/api/docs/api/generated/scan-api-contract-sections.md`。
  - `packages/api/docs/api/API_CONTRACT.md` 中请求/响应字段总览已切到 `@generated` block。
  - 已补 `generate:scan-api-contract-sections` / `check:scan-api-contract-sections` 脚本与契约测试守护。
- 已完成 `/scan` 第六阶段 API_CONTRACT 示例半自动同步：
  - 新增 `packages/api/scripts/sync-scan-api-contract-examples.ts`。
  - 新增 `packages/api/docs/api/generated/scan-api-contract-examples.md`。
  - `packages/api/docs/api/API_CONTRACT.md` 中 Example Request / Example Success Response 已切到 `@generated` block。
  - 已补 `generate:scan-api-contract-examples` / `check:scan-api-contract-examples` 脚本与契约测试守护。
- 已完成 `/scan` 第七阶段运行约束收口：
  - 新增 `packages/api/src/routes/core/scan-doc-contract.ts` 作为错误码/限制说明参考模块。
  - 新增 `packages/api/scripts/sync-scan-api-contract-operational-sections.ts`。
  - 新增 `packages/api/docs/api/generated/scan-api-contract-operational-sections.md`。
  - `packages/api/docs/api/API_CONTRACT.md` 中 ErrorCategory、Error Code Reference、Limits and Constraints 已切到 `@generated` block。
  - 已修正 `docs/api/openapi.yaml` 中 `/scan` 的 `AUTHENTICATION` 分类与 `401/408/413` 示例漂移。
- 已完成 `/scan` 第八阶段治理范围与 CLI/API parity 收口：
  - 扩展 `packages/api/src/routes/core/scan-doc-contract.ts`，集中治理范围说明与 CLI/API parity 映射。
  - 新增 `packages/api/scripts/sync-scan-api-contract-governance-sections.ts`。
  - 新增 `packages/api/docs/api/generated/scan-api-contract-governance-sections.md`。
  - `packages/api/docs/api/API_CONTRACT.md` 中 Governance Scope Note 与 CLI/API Parity 已切到 `@generated` block。
  - 已补 `generate:scan-api-contract-governance-sections` / `check:scan-api-contract-governance-sections` 脚本与契约测试守护。
- 已完成 `/scan` 第九阶段稳定性说明收口：
  - 扩展 `packages/api/src/routes/core/scan-doc-contract.ts`，集中 Version Stability Guarantee、Deterministic Output 与 Testing 说明。
  - 新增 `packages/api/scripts/sync-scan-api-contract-stability-sections.ts`。
  - 新增 `packages/api/docs/api/generated/scan-api-contract-stability-sections.md`。
  - `packages/api/docs/api/API_CONTRACT.md` 中 Version Stability Guarantee、Deterministic Output 与 Testing 已切到 `@generated` block。
  - 已补 `generate:scan-api-contract-stability-sections` / `check:scan-api-contract-stability-sections` 脚本与契约测试守护。
- 下一步新增：
  - 评估是否把 `/scan` 在 OpenAPI 的 examples/description 也进一步收口，或转向处理 `export-artifacts.mjs` 与 `evidence/service.ts` 这类大文件热点。
- 下一步可继续补 parser-level release notes 与更细的 compatibility cases。

4. route_binds 补源计划
- 已完成第一阶段最小闭环：
  - 支持 Fastify 字面量 `register(..., { prefix })`
  - 支持 Fastify 字面量 `get/post/...`
  - 支持经本地 import / re-export 的最小挂载链解析
- 已完成第二阶段主链收口：
  - 支持 `ROUTE_CONFIG.prefixes.*` 这类 route prefix config alias
  - 支持 `` `${exp}/evidence` `` 这类模板字符串 prefix
  - `packages/api` 当前可导出 `85` 条 `route_binds`，覆盖 core / experimental / vps-agent-web 主链
- 已完成第三阶段基础证据分层：
  - 每条 `route_bind` 标记 `binding=runtime_like`
  - 已补 `evidence.level / evidence.tier / evidence.activation / evidence.mountDepth`
  - 已能区分 core、experimental、vps-agent-web bridge 的默认启用条件
- 已完成第四阶段最小三层产物拆分：
  - `route_declares`: 本地声明层
  - `route_mounts`: 注册挂载层
  - `route_binds`: 组合后的 `runtime_like` 绑定层
- 已完成第五阶段受控 runtime 探针：
  - 在 `los-ast` 自仓场景下可从 `packages/api/dist` 生成遵守默认 flag wiring 的 `route_runtime`
  - `route_runtime` 不再强制挂载默认关闭的 experimental / vps 路由；如需验证启用态，需显式打开对应环境变量
  - `route_runtime` 明确暴露了 Fastify 运行时附加结果，如 `HEAD` 自动路由与部分 trailing-slash 变体
- 已完成第六阶段最小 runtime 差异归因：
  - 新增 `route_runtime_deltas`
  - 当前已区分 `exact_match`、`auto_head`、`trailing_slash_variant`
  - `packages/api` 在默认 wiring 下当前可导出 `route_runtime=6`、`route_runtime_deltas=6`
  - 显式启用 experimental / vps flag 时，当前可导出 `route_runtime=133`、`route_runtime_deltas=133`
- 已完成第七阶段最小控制流提证：
  - `route_mounts.activation` 与 `route_binds.evidence.activation` 已可直接标记 `source=control_flow_guard`
  - 当前已能从 `if (!ROUTE_CONFIG.enableExperimental) return;` 这类门禁中提取 `guardExpression`
  - `packages/api` 当前可直接提证 `!ROUTE_CONFIG.enableExperimental` 等 guard 来源
- 已完成第八阶段控制流扩展第一步：
  - 支持同函数内的 flag alias 转发，如 `const experimentalEnabled = ROUTE_CONFIG.enableExperimental`
  - 支持正向 block guard，如 `if (experimentalEnabled) { await register(...) }`
  - 支持经 alias 的 early-return guard，如 `const vpsDisabled = !ROUTE_CONFIG.enableVpsAgentWeb`
  - 已收紧 early-return 识别，仅把 block 顶层 `return` 视为 gate，避免嵌套回调误判
- 已完成第九阶段控制流扩展第二步：
  - 支持 `else` 分支内的 route mount 归因
  - 支持简单 `else if` 链，并继承前序分支的否定条件
  - 支持简单 `&&` block guard 归因，并记录 `guardShape=compound_and`
  - 支持简单 `||` early-return guard 归因，并记录 `guardShape=compound_or`
  - 组合 guard 当前会保留 `additionalConditions`，明确还有额外门禁存在
- 已完成第十阶段 helper gate 最小转发：
  - 支持同文件、单一 `return`、参数与实参一一映射的 helper boolean gate
  - 支持 `const foo = (...) => { ... }` 这类 arrow helper / route builder 的最小作用域提取
  - 当前 helper 展开仅限静态可替换表达式，不处理多语句或有副作用函数
- 第十一阶段优先补更复杂控制流：
  - 已补非字面静态 helper 转发后的 gate 识别（局部静态 alias + return、同文件 helper 链）
  - 已补带外层否定与括号的 helper compound / early-return guard 归因
  - 已补 expression-bodied arrow helper 与 arrow route builder 的最小作用域提取
  - 已补 single-parameter arrow helper / route builder（如 `flag => flag`、`async server => {}`）
  - 已补 grouped nested `&&` 的递归必需 flag 提取，并对 grouped `||` 保持保守附加条件归因
  - 更复杂 `else if` 链与布尔表达式归因
  - 已补多 flag 组合场景下的保守分层策略（`activation.mode=flag_set`）
- 第十二阶段再考虑 Express/前端 router 等其他框架。
- 验收：`route_binds` 不只“有值”，还要能解释“为什么存在 / 受什么条件控制 / 与 runtime 真相还差哪一层证据”。

5. 规则包治理
- 为治理规则包增加版本、来源、更新时间、加载顺序约束。
- 固定 `rules/projects/lsclaw-governance/` 的组织方式。
- 已完成前端 HTTP 治理规则的第一阶段语义收口：
  - `frontend-interface.yml` 已拆分为 `fetch` 与 `axios method` 两条规则，保留原 `id` 给 `fetch` 以维持兼容。
  - 已补常见直接调用形态覆盖：`fetch(url)`、`fetch(url, options)`、`window.fetch(url)`、`request(url, options)` / `apiRequest(url, options)` 这类函数式 wrapper、`axios.{get,post,put,patch,delete}(url[, args])`、常见 `apiClient/client/http/httpClient/requestClient/restClient` 实例名，以及受限泛化对象名（如 `billingApi.get(...)`、`requestGateway.post(...)`）。
  - 已补最小 wrapper 实现体识别：可识别直接转发到 `fetch/window.fetch`、受约束 HTTP client，以及一层 wrapper-to-wrapper 转发的函数/arrow wrapper。
  - 已补针对性回归测试与负例保护，避免 helper 调用（如 `axios.create(...)`）误报。
  - 已在规则文档中补充“不要在 capture 不共享的 `any` 规则上挂分支特有 constraint”的编写约束。
- 已补最小整包 fixtures 基线：
  - 新增 `fixtures/golden/lsclaw-governance-pack/`。
  - `test/rules.test.mjs` 已固定整包命中阈值：`total=5`，`severity={error:1,warning:3,info:1}`，`impactHint={high:1,medium:3,low:1}`。
- 已补规则来源可追溯说明：
  - 新增 `docs/rules/RULE_TRACEABILITY.md`，明确 `rulePack -> glob -> ruleFile -> finding` 的发布/装载链路。
  - 已同步 README、RULESET、RULE_PACKS、RULE_AUTHORING、OUTPUT_SCHEMA 的入口与消费说明。
- 下一步：
  - 评估是否要继续扩到任意对象名的 `.get/.post/...` 与更高层封装识别。
- 验收：规则来源可追溯，规则漂移可定位。

## P2 中期优先级

1. 预览域迁移
- 将 incident / approval / recovery / memory 的长期职责迁出 `los-ast`，保留兼容层或单独服务。
- 验收：`los-ast` 回到 code intelligence kernel 的边界。

2. 存储抽象
- 已完成 repository 抽象与后端替换基线：
  - 预览域已统一走 repository / key-value-store 边界。
  - 当前支持 `memory / file / sqlite` 三种 backend。
  - `incident / approval / recovery` 已补 SQLite 领域表、migration 与事务边界。
- 下一步：
  - 继续评估 `attribution / memory / evidence / hotreload` 是否需要进一步下沉为领域表，而不只停留在通用 KV / repository 层。
- 验收：store 不再直接决定长期状态模型，测试可替换存储实现。

3. 平台化与异步化
- 为大扫描引入 async task 模式、分页与更完整的 observability。
- 验收：超过同步阈值时不再只能拒绝，可进入受控异步流程。

## 当前不承诺

- 不承诺完整的接口治理平台能力。
- 不承诺数据库字段治理已开箱即用。
- 不承诺预览域的持久化与跨重启状态一致性。
- 不承诺 `vps-agent-web` 路由组已达到长期稳定契约级别。
- 不承诺 `structure-map.route_binds` 已能覆盖变量前缀、模板路径和多框架场景。
- 不承诺 `structure-map.route_binds` 已能作为 route truth 的单一权威来源。

## 下一步执行顺序

1. 先收口文档与下游预期
- 所有引用 `structure-map` 的说明统一写成“结构证据优先，Fastify route binds 已支持基础分层说明，完整 route truth 暂不承诺”。

2. 再补 runtime 差异归因
- 在现有 `route_runtime_deltas` 和 `control_flow_guard` 基础上，继续补更细的框架自动行为与更复杂 gate 模式，而不只停在 `HEAD` / slash 变体。

3. 最后扩到更多框架
- 在 Fastify 边界稳定后，再扩 Express、前端 router 或其他注册模型，避免再次回到“大而空”的 route truth 叙事。

## 参考文档

- `README.md`
- `docs/architecture.md`
- `docs/architecture-boundary-spec.md`
- `packages/api/docs/api/API_CONTRACT.md`
- `docs/service-readiness-degradation-contract.md`
