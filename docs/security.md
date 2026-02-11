# 安全与护栏

## 默认原则

- 默认只读：`scan` 只产出报告，不写文件。
- 默认 dry-run：`fix` 默认只输出 diff，不写文件。
- 显式写入：只有 `fix --apply` 才会落盘。

## 风险控制

- 变更上限：`--max-changes N` 限制一次运行最多应用 N 个 match 的改写。
- 作用域限制：project adapter 固定 root，并带 include/exclude（默认忽略依赖目录与构建产物）。
- 冲突检测：同文件多 edits 如发生重叠，停止并报告冲突（避免写出不可预期结果）。

## AI 使用约束（强制建议）

- 先 `scan`，再 `fix --dry-run`，审阅 diff 与 JSONL 报告后，再 `fix --apply`。
- 高风险规则（如跨文件重命名、导入重排、公共 API 改动）应保持为“只报告”或需要人工确认。
