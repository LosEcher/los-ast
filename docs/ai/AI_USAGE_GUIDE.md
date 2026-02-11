# AI 使用手册

本手册面向“会读代码、会写规则、会跑工具”的 AI Agent，目标是让变更可控、可复现、可验证。

## 强制工作流

1. `scan`：先定位问题并产出 JSONL 报告
2. `fix --dry-run`：生成 diff，不落盘
3. 审阅：依据 diff 与规则 message 判断风险
4. `fix --apply`：显式写入
5. 验证：跑目标项目自带测试/构建

## 命令速查

```bash
# 扫描（只读）
npm run los-ast -- scan --project cantool --format jsonl

# 生成 diff（不落盘）
npm run los-ast -- fix --project cantool --dry-run --max-changes 20

# 真正写入
npm run los-ast -- fix --project cantool --apply --max-changes 20
```

### 自定义根目录（不走适配器）

```bash
npm run los-ast -- scan --root /abs/path/to/repo --format jsonl
```

### 解释某个位置为什么被匹配

```bash
npm run los-ast -- explain --project cantool --file /abs/path/to/file.rs --pos 120:7
```

### 环境与规则健康检查

```bash
npm run los-ast -- doctor --project cantool
```

## AI 输出解析建议

- 对每条 JSONL 记录，优先读取：`ruleId`、`file`、`range`、`message`、`excerpt`。
- 对 fix 结果，读取：`proposedReplacement` 与 `diff`。

## 禁止事项

- 不允许直接对整个仓库做全文替换。
- 不允许在未 dry-run 的情况下写入。
- 不允许突破 adapter 的 root 与 ignore 约束。
