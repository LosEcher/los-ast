# 生态调研：通用 AST/解析/重写工具

本文汇总你列出的工具，并从“是否通用、适配成本、生态成熟度、可借鉴点”四个维度，判断其对 los-ast 这种“多仓库通用 AST 扫描/改写框架”的参考价值。

## 结论速览（是否通用）

- ast-grep：通用（多语言结构化搜索/重写/规则体系），强相关参考对象。
- Tree-sitter：通用（解析基础设施），适合做“底座”与多语言扩展。
- coala/coAST：理念通用，但更偏研究/规格化尝试，工程落地门槛与不确定性较高。
- ANTLR：通用（语法/解析器生成），适合自定义 DSL 或需要强语法控制的场景，但对“多语言现成仓库分析”成本更高。
- Roslyn：不通用（强绑定 .NET 生态），适合 .NET 工具链。
- Python ast：不通用（仅 Python），但可借鉴“标准库级 AST API 的稳定抽象”。

## 对照表（可参考信息与借鉴点）

| 工具 | 是否通用 | 工具名称/描述 | 支持语言示例 | 开源平台/许可证 | 备注 | 借鉴点（对 los-ast） |
|---|---|---|---|---|---|---|
| ast-grep | 是 | 结构化搜索/重写/规则驱动（CLI + API） | 多语言，基于 Tree-sitter 语法 | GitHub / MIT | 强工程化：YAML 规则、交互式改写、快速并行 | 规则 DSL（pattern/inside/has/constraints）、可重放报告、语言包/动态加载机制 |
| Tree-sitter | 是 | 增量解析系统（parser generator + library） | 多语言（生态 parsers 丰富） | GitHub / MIT | 编辑器与代码分析工具常用底座 | 语言解析底座；增量解析/缓存；query 机制（可作为高级匹配补充） |
| coala/coAST | 部分 | 语言无关 AST 框架/语言定义集合（更偏规范化） | 理论上任意语言 | GitHub / CC0（facts）+ MIT（代码可能另行声明） | 更偏“通用 AST 规范”与语言定义库 | 如果要做“跨解析器统一 IR”，可参考其 schema 思路；但短期不建议以此为主线 |
| ANTLR | 是 | 语法/解析器生成（LL(*)），适合 DSL/编译器 | 通过目标语言生成运行时 | GitHub / BSD-3-Clause | 语法控制强，但需要维护 grammar | 用于自定义规则语言/DSL 或补充对非 Tree-sitter 生态语言的支持 |
| Roslyn | 否 | .NET 编译器平台 + 分析 API | C#、VB.NET | GitHub / MIT | IDE 级能力（语义模型/重构） | 当目标仓库是 .NET 时，提供更强“语义级规则”路径（另做 adapter） |
| Python ast | 否 | Python 标准库 AST | 仅 Python | Python 官方 / PSF License | 零依赖，API 稳定 | “稳定 AST 抽象 + 位置/节点遍历 API”值得借鉴；但不适合做多语言底座 |

## 推荐直接参考的 GitHub/文档入口

- ast-grep 项目与文档（规则系统、动态语言、CLI 体验、NAPI API）
- tree-sitter/tree-sitter（增量解析与语言 parser 生态）
- antlr/antlr4（生成器 + runtime，多语言 target）
- dotnet/roslyn（大型工程的分析/重构 API 组织方式）
- Python 官方 ast 文档（AST API 设计与位置信息）

## 借鉴到 los-ast 的“有意义部分”（可执行建议）

1. 规则分层与分发（参考 ast-grep）
   - 保持 `rules/languages/*` 与 `rules/projects/*` 分层，并引入“规则包清单（manifest）”，让一个 pack 可复用、可版本化。

2. 更强的规则表达能力（参考 ast-grep constraints）
   - 在 YAML 中增加可选 `constraints`（regex、kind 限制等），并在 core 执行时透传给 matcher。

3. 增量/缓存（参考 Tree-sitter）
   - 对同一文件多规则运行时缓存解析结果；后续可扩展为“基于 mtime/hash 的 AST cache”，降低重复扫描成本。

4. 输出与可复现（参考 CLI 工具生态）
   - 保持 JSONL 稳定 schema；在每条记录中补充 `ruleFile`（来源）与 `fingerprint`（用于去重/回放）。

5. 语言扩展机制（参考 ast-grep 动态语言）
   - 将“动态语言注册”做成可配置：adapter 可声明需要加载的 `@ast-grep/lang-*` 列表。

