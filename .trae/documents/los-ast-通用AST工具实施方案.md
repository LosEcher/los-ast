## 目标与范围
- 在 `/Users/echerlos/Downloads/projects/los-ast` 创建一个“通用 AST 扫描/改写工具”，用于辅助 AI 在多个代码库（cantool/lsclaw/fullstackframe）中进行结构化检索、诊断、自动修复与批量重构。
- 输出两类产物：
  - 可执行工具（CLI + 可编程 API），支持 dry-run、生成 diff、批量 rewrite、规则包管理。
  - 面向 AI 的使用手册与机读输出规范（JSONL/Markdown），便于 Agent 可靠调用。

## 现状调研结论（与方案关联）
- cantool：Rust(Tauri 2) + React/Vite，Rust 侧依赖多、模块多，适合用结构化规则做“精准定位 + 小步修复”。
- lsclaw：Node ESM + TS 配置模块、脚本/编排多，适合用规则做“配置一致性/安全策略/脚本规范化”扫描与修复。
- fullstackframe：admin-framework 后端 Bun+TS(Elysia) + 前端 React/Vite，适合用规则做“API/中间件/路由一致性、日志与安全基线”扫描与修复。
- los-ast 目录当前为空，需要从 0 初始化项目结构。

## 技术路线（核心选择）
- 统一引擎：优先采用 ast-grep（tree-sitter 解析，支持多语言结构化 search/replace，规则可 YAML 化，适合规则包复用与 AI 驱动自动修复）。
- 分层设计：
  - core：工作流/规则执行/报告与 diff 生成/安全护栏
  - adapters：为 cantool/lsclaw/fullstackframe 提供“目标路径、语言集、include/exclude、默认规则集、项目特定约束”
  - rules：按语言与项目分组的规则包（scan + fix），并配套 golden tests
  - ai-interface：稳定的命令行/JSON schema/提示词模板（让 AI 可控、可复现地调用）

## 重难点（标注与应对策略）
- 规则幂等性（难点）：同一修复重复执行不应反复改动。
  - 策略：每条 fix 规则配套“before/after golden 测试”；rewrite 前做二次匹配确认；对同一节点仅一次替换。
- 多语言格式化与风格保持（难点）：改写后如何保持原风格、避免大面积 diff。
  - 策略：优先用 AST 级别替换最小片段；必要时集成项目现有 formatter（Rust fmt、TS lint/format）作为可选后置步骤（默认不自动跑，避免副作用）。
- 作用域与安全护栏（难点）：AI 容易跑偏、误改大量文件。
  - 策略：默认 dry-run；rewrite 需要显式 `--apply`；限定 target roots；提供 allowlist/denylist；每次输出“变更上限阈值”与“需要人工确认的高风险改动”。
- Tree-sitter 语法差异/宏（难点，Rust/Tauri 宏）：宏与属性可能造成匹配不稳。
  - 策略：规则尽量基于稳定语法结构（函数/模块/调用表达式）而非 token；必要时分语言 strictness 策略与 kind 约束。
- 大仓性能（中等）：扫描成本与并行。
  - 策略：增量缓存（按文件 hash + parser version）；并行 scan；输出分片 JSONL。

## 预期项目文件结构（将创建）
- `los-ast/`
  - `README.md`（入口说明）
  - `docs/`
    - `architecture.md`（整体架构与边界）
    - `ai/`
      - `AI_USAGE_GUIDE.md`（给 AI 的操作手册，含稳定命令、输入输出 schema、示例工作流）
      - `PROMPTS.md`（可复制的系统提示词/任务模板）
      - `OUTPUT_SCHEMA.md`（JSONL 字段定义、兼容策略）
    - `rules/`
      - `RULE_AUTHORING.md`（规则编写规范、命名、测试、幂等性）
      - `RULE_PACKS.md`（规则包组织方式）
    - `adapters/`
      - `cantool.md`
      - `lsclaw.md`
      - `fullstackframe.md`
    - `security.md`（护栏、误改风险控制）
    - `troubleshooting.md`
  - `packages/`
    - `core/`（执行引擎：扫描/改写/报告/缓存/文件系统抽象）
    - `cli/`（命令行：scan/fix/explain/report）
    - `adapters/`（项目适配器：三项目默认配置与规则集绑定）
    - `rules/`（内置规则包与测试用例）
    - `ai/`（AI 接口：schema、模板、可机读输出、任务编排）
  - `rules/`（可热加载的 YAML 规则库，按语言/项目拆分）
    - `languages/`（通用规则）
    - `projects/`（项目特化规则）
  - `fixtures/`（golden 测试用例：before/after）
  - `reports/`（默认输出目录：本地报告与 JSONL）

## 核心 CLI 设计（将实现）
- `los-ast scan --project <cantool|lsclaw|fullstackframe> --rules <pack> --format <jsonl|md>`
- `los-ast fix  --project ... --rules ... --dry-run|--apply --max-changes N`
- `los-ast explain --rule <id> --file <path> --pos <line:col>`（给 AI/人类解释匹配原因与修复意图）
- `los-ast doctor`（检查环境、规则加载、语言支持、路径可访问性）

## 规则体系（将落地的最佳实践）
- 规则命名：`<scope>.<lang>.<category>.<intent>`，例如 `cantool.rust.logging.no_secret_in_log`。
- 每条规则包含：id、language、severity、message、rule、(可选)fix/rewrite、tags、references。
- 每条 fix 规则必须配套：
  - 至少 1 个 before/after fixture
  - 幂等性测试（对 after 再跑一次应无 diff）

## 三个项目的首批规则包（将先做“高性价比”）
- cantool（Rust/Tauri）：日志宏使用一致性、错误处理（thiserror/Result 约定）、命令参数命名一致性、潜在 panic/unwrap 风险点扫描（只报告，默认不自动修）。
- lsclaw（Node/ESM）：脚本入口一致性、配置签名/加载路径规范、敏感数据处理（只报告 + 提示修复建议）。
- fullstackframe（Bun/Elysia + React）：中间件链路/鉴权边界提示、路由注册一致性、日志字段规范、前后端 API 路径对齐检查（先报告，后续再自动修）。

## 验证与回归策略（将实现）
- 单元测试：规则解析、匹配、rewrite 结果校验。
- Golden tests：fixtures 目录的输入输出对比。
- 在三项目上做“只读扫描”基线报告，再选择少量低风险 fix 规则做 dry-run diff 验证。

## 文档交付清单（将创建并写满）
- `docs/architecture.md`：分层架构、模块职责、数据流（scan→match→report / fix→diff→apply）。
- `docs/ai/AI_USAGE_GUIDE.md`：
  - 允许 AI 做的事与禁止事项
  - 典型工作流：定位→生成规则→dry-run→审阅 diff→apply→验证
  - 输出 JSONL 的字段解释与“AI 解析约定”
- `docs/rules/RULE_AUTHORING.md`：规则模板、调试方法、幂等性与风险分级。
- `docs/adapters/*.md`：每个项目的默认路径、忽略目录、首批规则包、常见问题。

## 执行顺序（确认后我会开始实际创建文件与初始化）
1. 初始化 los-ast 的 monorepo 结构与基础文档骨架。
2. 实现 core/cli 的最小可用：scan + JSONL 报告 + dry-run diff。
3. 增加 adapters（三项目路径与默认规则集）。
4. 引入规则包与 fixtures 测试框架，落地首批规则。
5. 补齐 AI 使用手册与输出 schema，确保可机读与可复现。

如果你确认该方案，我将开始在 `los-ast` 中创建上述目录结构与文档，并实现最小可用 CLI + 规则/适配器骨架。