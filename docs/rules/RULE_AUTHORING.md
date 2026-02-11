# 规则编写规范

## 规则文件格式（YAML）

一个最小规则示例：

```yaml
id: demo.js.no-console-log
language: JavaScript
severity: warning
message: "避免在生产代码中使用 console.log"
rule:
  pattern: console.log($A)
```

可选支持修复（fix）：

```yaml
fix:
  replace: console.info($A)
```

## 字段说明

- id：全局唯一，建议使用 `scope.lang.category.intent`。
- language：语言名（与 parser 注册一致）。
- severity：`info|warning|error`（用于报告分级）。
- message：人类/AI 可读说明。
- rule：ast-grep rule object（pattern/kind/inside/has/...）。
- fix：可选，定义如何生成 replacement。
## 幂等性与可测试性

- fix 规则必须在 `fixtures/` 下提供 `before` 与 `after`。
- after 再运行 fix 不应产生 diff。
- 规则应尽量匹配“稳定语义结构”，避免依赖空格/换行/token。
## 风险分级建议

- 只报告（默认）：潜在安全风险、涉及公共 API、跨文件引用变更。
- 低风险可自动修：局部替换、等价表达式替换、日志宏替换等。
