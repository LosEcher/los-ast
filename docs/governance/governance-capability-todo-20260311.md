# lsclaw / VPS Agent Web 治理能力对齐 TODO（阶段交付：2026-03-11）

状态：阶段记录。当前执行请以 `docs/ACTIVE_TODO.md` 为准；本文件保留 2026-03-11 的治理阶段结论与后续入口。

## 一、当前定位（阶段性结论）

- `los-ast` 当前**能稳定提供代码层治理**，是 `lsclaw` 和 `VPS Agent Web` 可复用的扫描内核。
- `接口治理 / 字段治理`在当前里程碑中**不属于开箱即用能力**，因为缺失：
  - OpenAPI/IDL/Schema 结构化解析输入层
  - 数据库 schema/DDL 元模型输入层
  - 跨版本字段语义比较与兼容性规则引擎
- 结论：`lsclaw/vpsagentweb`可立即用它做“前后端代码治理证据层”；但不能直接承担“接口/字段治理主控”。

## 二、本阶段交付（Sprint1）

### 目标
把治理范围从“零散规则”升级为“分层治理入口”，先保证可执行、可复用、可追踪。

### 1) 文档与边界收口
- [x] 新增本 TODO 文档，明确可支持项与非支持项。
- [x] 在共享类型 `Finding` 中预留字段，用于后续来源分层：
  - `findingSource`
  - `governanceDomain`
  - `impactHint`
- [x] 更新 API/合同文档的发现字段说明。

### 2) 规则治理基础
- [x] 建立统一治理包目录：`rules/projects/lsclaw-governance/`
- [x] 已沉淀 Frontend / Backend / Database 三类代码层治理规则（可迭代扩展）
- [x] 已在规则中加入 `governance` 元信息（domain / owner / impact / rationale）
- [x] 已为规则包补充最小 `fixtures` 样例验证与整包 threshold 基线

### 3) 接口与字段治理规划（P1+）
- [ ] 定义“字段治理规则 DSL v1”与输入源：OpenAPI、Prisma/SQL、GraphQL/JSON Schema。
- [ ] 增加 contract/scehma finding source 的结果序列化管道。
- [ ] 与 `lsclaw` 同步：统一 `policy.routeIntent` 与 `tags`。

## 三、阶段验收标准（本轮）

- [x] Core `/scan` 与 `/discover/symbols` 可继续稳定工作。
- [x] 规则治理包目录存在且可被 `scan` 加载。
- [x] 文档能回答“现在能做什么、不能做什么、何时能做”。
- [x] 下阶段已明确 2 条可执行输入源任务（如 OpenAPI 解析）。

## 四、下阶段TODO（按优先级）

1. **低风险 P1（1-2 周）**：补齐规则注入策略与多项目治理包的版本治理。
2. **中风险 P2（3-6 周）**：开发接口 schema 入库模型，支持 `contract` finding source。
3. **高价值 P3（6-10 周）**：数据库字段变更语义规则 + 兼容性分级（破坏性/非破坏性）。
4. **平台化 P4（10-12 周）**：形成可视化看板：规则命中趋势、按租户隔离、按严重级别聚合。

## 五、阶段2交付（2026-03-11）复盘

- [x] `/scan` 契约测试新增 `schemaArtifacts` 字段回归（contract 测试 + integration 测试）。
- [x] `findingSource` 与 `ruleId` 在服务层按来源固定归类（contract/schema）。
- [x] `contractArtifacts` 字段已补充 OpenAPI 与测试链路，`schemaArtifacts` 同步完成。

### 2 阶段优先级（继续）

1. **优先级高（2-5 天）**：  
   - 固定规则发布版本与加载顺序（避免规则漂移）；  
   - 补规则来源可追溯字段在发布/装载链路中的消费说明。
2. **优先级中（1-2 周）**：  
   - 引入 `contract` 输入源解析（OpenAPI / JSON Schema）最小管道；  
   - 输出统一 `findingSource=contract`（含 `governanceDomain/impactHint`）并补 `golden` 对齐。
3. **优先级中（2-3 周）**：  
   - 引入 `schema` 输入源解析（DDL/Prisma）最小管道；  
   - 增加字段级治理策略模板（枚举、空值、长度、敏感字段）。
4. **优先级低（1 个月）**：  
   - 与 lsclaw 对齐 `policy.routeIntent` 与验收标签；  
   - 增加“治理来源可追溯”审计字段（规则包版本、数据源版本、输入提交者）。
