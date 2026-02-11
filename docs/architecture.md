# 架构说明

## 设计目标

- 多语言：以 tree-sitter AST 为基础，支持跨语言结构化匹配与最小改写。
- 可控：默认 dry-run，生成 diff 与机读报告；真实改写需要显式 `--apply`。
- 可复现：输出稳定 JSONL，便于 AI 与流水线消费。
- 可扩展：通过 rules（YAML 规则包）与 adapters（项目适配器）解耦规则与目标仓库。

## 分层与边界

**packages/core**
- 负责：文件发现、规则加载、AST 解析、匹配、生成 edits、diff、应用改写、报告聚合。
- 不负责：CLI 参数解析、项目默认路径与规则集选择（由 adapters/cli 完成）。

**packages/cli**
- 负责：命令行 UX（scan/fix/explain/doctor）、输出格式选择（jsonl/md）、安全阈值（max-changes）。

**packages/adapters**
- 负责：为 cantool/lsclaw/fullstackframe 提供默认配置：
  - root 路径（绝对路径）
  - include/exclude globs
  - 默认规则包集合
  - 风险阈值与建议验证命令（文档层面）

**rules/**
- 负责：可热加载的 YAML 规则库。
  - `languages/`：通用语言级规则（JS/TS/Rust 等）
  - `projects/`：项目特化规则

**fixtures/**
- 负责：golden fixtures，用于验证规则与改写的幂等性与正确性。
## 数据流

### scan

1. CLI 选择 project 与规则集
2. core 扫描文件（include/exclude）
3. 对每个文件按语言解析 AST
4. 运行规则并收集 matches
5. 输出 JSONL/Markdown 报告

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
