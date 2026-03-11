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

可选支持约束（constraints），用于对捕获变量做二次过滤（常用于缩小匹配范围）：

```yaml
rule:
  pattern: console.$M($A)
constraints:
  - name: M
    regex: "^log$"
```

约束只会在对应 capture 存在时通过；如果一个 `any` 规则的不同分支并不共享同一组 capture，不要把只适用于某个分支的约束挂在整个规则上。此时应拆成多条规则，避免无关分支因为缺少 capture 而被整体过滤。

## 字段说明

- id：全局唯一，建议使用 `scope.lang.category.intent`。
- language：语言名（与 parser 注册一致）。
- severity：`info|warning|error`（用于报告分级）。
- message：人类/AI 可读说明。
- rule：ast-grep rule object（pattern/kind/inside/has/...）。
- constraints：可选，捕获变量正则约束数组；`name` 为捕获名（不带 `$`），`.` 代表整个匹配节点文本。
- fix：可选，定义如何生成 replacement。
- governance（可选）：为接口治理/字段治理预留的元信息。
  - `governance.domain`: `frontend`/`backend`/`database`/`interface`/`quality`/`security`
  - `governance.owner`: 规则所有者
  - `governance.impact`: `high`/`medium`/`low`
  - `governance.rationale`: 规则存在原因
- findingSource（可选）：规则归属来源标签（规划中），用于区分 `ast`、`contract`、`schema`
## 幂等性与可测试性

- fix 规则必须在 `fixtures/` 下提供 `before` 与 `after`。
- after 再运行 fix 不应产生 diff。
- 规则应尽量匹配“稳定语义结构”，避免依赖空格/换行/token。
## 风险分级建议

- 只报告（默认）：潜在安全风险、涉及公共 API、跨文件引用变更。
- 低风险可自动修：局部替换、等价表达式替换、日志宏替换等。
