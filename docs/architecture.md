# 架构说明

## 设计目标

- 多语言：以 tree-sitter AST 为基础，支持跨语言结构化匹配与最小改写。
- 可控：默认 dry-run，生成 diff 与机读报告；真实改写需要显式 `--apply`。
- 可复现：输出稳定 JSONL，便于 AI 与流水线消费。
- 可扩展：通过 rules（YAML 规则包）与 adapters（项目适配器）解耦规则与目标仓库。

## 分层与边界

**packages/core**
- 负责：稳定扫描内核，包括文件发现、规则加载、AST 解析、匹配、改写、explain 与报告聚合。
- 当前入口：`discoverFiles`、`scan`、`fix`、`explainAtPosition`。
- 不负责：CLI 参数解析、项目默认路径与规则集选择、HTTP 路由与 OpenAPI 契约。

**packages/cli**
- 负责：稳定命令行 UX（`scan/fix/explain/doctor`）、输出格式选择（jsonl/md）、安全阈值（`max-changes`），以及 `hub-lite:artifacts` 导出。
- 同时承载 `structure-map` / `route_declares` / `route_mounts` / `route_binds` / `route_runtime` 的静态与受控 runtime evidence 提取。

**packages/api**
- 负责：稳定 API 面 `GET /healthz/live`、`GET /healthz/ready`、`POST /scan`、`POST /discover/symbols`，以及 preview 路由容器。
- `/scan` 当前同时承接三类输入：
  - AST/rule 扫描
  - native OpenAPI / schema documents & comparisons
  - passthrough artifact inputs（`contractArtifacts` / `schemaArtifacts`）
- `packages/api/dist` 作为受控运行时产物，既用于生产启动，也用于 `hub-lite` runtime probe。

**packages/adapters**
- 负责：为 cantool/lsclaw/fullstackframe 提供默认配置：
  - root 路径（绝对路径）
  - include/exclude globs
  - 默认规则包集合
  - 风险阈值与建议验证命令（文档层面）

**packages/ai**
- 负责：AI 友好输出 schema、结构化输出约束与相关生成资产。

**packages/shared**
- 负责：跨包共享的基础类型与通用工具，不承载项目接入编排。

**rules/**
- 负责：可热加载的 YAML 规则库。
  - `languages/`：通用语言级规则（JS/TS/Rust 等）
  - `projects/`：项目特化规则

**fixtures/**
- 负责：golden fixtures，用于验证规则与改写的幂等性与正确性。

## 稳定面与预览面

- 稳定面：
  - `packages/core`
  - `packages/cli`
  - `GET /healthz/live`
  - `GET /healthz/ready`
  - `POST /scan`
  - `POST /discover/symbols`
- 预览面：
  - `packages/api/src/routes/experimental/*`
  - `packages/api/src/routes/vps-agent-web/*`
  - incident / approval / attribution / recovery / memory proposal 相关流程

## 数据流

### CLI scan / fix / explain

1. CLI 选择 project 与规则集
2. core 扫描文件（include/exclude）
3. 对每个文件按语言解析 AST
4. 运行规则并收集 matches
5. 输出 JSONL/Markdown 报告

### API `/scan`

1. Fastify 路由做请求体验证、scope/identity/cancellation/limit 处理
2. scan service 按输入模式选择 `ast`、`native_only` 或 `hybrid`
3. AST findings、native contract/schema findings 与 passthrough artifacts 进入统一 finding 管道
4. 统一返回 findings、parse failure telemetry、scan telemetry
5. `/scan` 文档、OpenAPI 与 API_CONTRACT 通过 generated sections 守护不漂移

### CLI `hub-lite:artifacts`

1. 运行 core `scan`
2. 运行符号发现与 source structure 提取
3. 组合 `scan-findings.jsonl`、`symbols.json`、`structure-map.json`
4. 在受控条件下用 `packages/api/dist` 做 Fastify runtime probe，生成 `route_runtime` / `route_runtime_deltas`

### fix

1. scan 得到 matches
2. 对每条 match 生成 edits
3. 合并 edits（按 startPos 排序、冲突检测）
4. 生成 unified diff（dry-run 输出，不落盘）
5. `--apply` 时写回文件并生成最终报告

## 安全护栏

- 默认 dry-run
- `--apply` 必须显式提供
- `--max-changes` 限制一次运行最大变更数
- 项目适配器提供默认 denylist（如 node_modules、target、dist、.git）
- `/scan` 契约真源、OpenAPI generated blocks 与 `API_CONTRACT` 片段有专门 freshness gate
- 影响 `packages/api` 运行时行为的改动需要同步刷新 `packages/api/dist`
