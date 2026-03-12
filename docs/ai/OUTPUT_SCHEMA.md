# 输出 Schema（JSONL）

los-ast 的 `--format jsonl` 输出为 JSON Lines：每行一个 JSON 对象，便于流式处理与 AI 解析。

## 通用字段

- `tool`: 固定为 `los-ast`
- `version`: 工具版本（当前为 `0`，后续会语义化版本化）
- `timestamp`: ISO8601 时间
- `project`: `cantool|lsclaw|fullstackframe|custom`
- `ruleFile`: 规则来源 YAML 文件（绝对路径，可能为 null）
- `ruleId`: 规则 id
- `findingSource`: 来源通道（常见为 `ast|contract|schema`）
- `governanceDomain`: 规则治理域（可选；未命中治理元信息时可能为 `null`）
- `impactHint`: 轻量风险提示（可选，`low|medium|high`；未命中治理元信息时可能为 `null`）
- `severity`: `info|warning|error`
- `message`: 规则提示
- `fingerprint`: 稳定去重指纹（sha256 hex）
## 定位字段

- `file`: 绝对路径
- `language`: 语言标识
- `range`: `{ start: { line, column, index }, end: { line, column, index } }`
- `excerpt`: 匹配代码片段（短文本）
## 修复字段（fix）

- `hasFix`: boolean
- `proposedReplacement`: string（dry-run 时也会给出）
- `diff`: string | null（unified diff；仅 fix 输出，未生成 diff 时可能为 `null`）
- `applied`: boolean（仅 fix 输出，表示是否已落盘写入）
## 兼容性约定

- 任何新增字段必须保持向后兼容：新增可选字段，不删除已有字段。
- AI 消费端只应依赖上面“通用字段 + 定位字段”。

规则来源追溯与 `ruleFile` / `findingSource` / `governanceDomain` / `impactHint` 的解释，见：

- `docs/rules/RULE_TRACEABILITY.md`

## JSON Schema

- 机器可读 schema：`packages/ai/schemas/los-ast-output.schema.json`
