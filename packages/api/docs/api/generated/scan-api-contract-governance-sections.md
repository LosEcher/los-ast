<!-- @generated scan-api-contract-governance:begin -->
## Governance Scope Note (March 2026)

`/scan` 当前已补齐代码层扫描能力，并支持最小化 `contractArtifacts/schemaArtifacts` 直通，以及 `openApiDocuments/openApiComparisons/schemaDocuments/schemaComparisons` 的原生输入。默认输出的 `findingSource` 为 `ast`，并可与 `contract/schema` findings 并行返回。

| 维度 | 当前状态 | 说明 |
|------|----------|------|
| 前端/后端接口治理 | 代码层可扫描（如调用方式、错误处理、网络层封装） | 可通过规则包持续补齐 |
| 接口契约治理 | `contract` 域已支持最小接入 | 支持 `contractArtifacts` 直通、`openApiDocuments` 原生输入和 `openApiComparisons` 最小兼容性对比；当前已支持本地 `$ref`、简单 `allOf`、`oneOf/anyOf` 公共字段归一（含 response 侧本地 ref 组合场景）、success response 按状态码对齐，以及 object 嵌套路径、`array.items` 路径和 `additionalProperties` map-like 路径的 request/response comparison；嵌套路径中的本地 `$ref`、简单 `allOf` 与 `oneOf` 数组项组合也已有回归覆盖，更完整的 OpenAPI/IDL/Schema 提取器仍在后续阶段 |
| 字段治理 | `schema` 域已支持最小接入 | 支持 `schemaArtifacts` 直通和 `schemaDocuments` 原生输入；当前已覆盖主键缺失、敏感字段可空、生命周期默认值与审计时间默认值等基础结构检查 |
| 兼容性治理 | `contract/schema` 域已支持最小对比 | `contract` 支持 `openApiComparisons` 的 operation 删除、请求字段删除/类型变化/必填新增、请求新增必填字段带 default 的降级提示、响应字段删除/类型变化、响应 required -> optional 变化、最小值语义 comparison（`nullable` 收紧、`enum` 值删除、`default` 删除/变更），以及最小 `discriminator` comparison（`propertyName` 变化、mapping 值删除）；`schema` 支持 `schemaComparisons` 的字段删除、类型变化、主键变化、字段/组合唯一键 drift、`nullable -> required` / `required -> nullable` 分级、新增必填字段分级、default drift 分级，以及保守 SQL/Postgres type/default 等价归一与极少数 widening warning |
| 数据库字段治理 | `schema` 域未内置 | 需要 schema/DDL 侧解析与字段变更语义模型 |

`findingSource='contract'|'schema'` 是后续演进预留字段，与现有 `findingSource='ast'` 兼容。

更多 parser 能力边界与发布说明见：

- `docs/api/ARTIFACT_PARSER_CAPABILITIES.md`
- `docs/rules/FINDING_ATTRIBUTION.md`

## CLI/API Parity

The CLI `scan` command produces identical output structure to the API:

```bash
# CLI output (JSONL format)
los-ast scan --root /path --include "src/**/*.ts" --format jsonl
```

CLI options map to API fields:

| CLI Option | API Field | Notes |
|------------|-----------|-------|
| `--root <dir>` | `rootDir` | Resolved to absolute path |
| `--project <name>` | `project` | Defaults to `'custom'` |
| `--include <glob>` | `include` | Array of glob patterns |
| `--ignore <glob>` | `ignore` | Array of glob patterns |
| `--rules <glob>` | `rules` | Rule file patterns (optional addon patterns) |
| `--deterministic` | `deterministic` | CLI flag opt-in; API 默认为 false |
| N/A | `scope` | CLI runs in local mode and does not wrap findings in a `data` envelope |
<!-- @generated scan-api-contract-governance:end -->
