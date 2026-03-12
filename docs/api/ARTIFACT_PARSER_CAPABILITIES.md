# Artifact Parser Capabilities

更新时间：2026-03-12

本文件用于固定 `packages/api/src/services/artifact-parsers/registry.ts` 当前声明的 parser 能力面、已知边界和 fixture 入口。

## Capability Matrix

| Profile | Source | Version | Stability | Inputs | Current Coverage |
| --- | --- | --- | --- | --- | --- |
| `openapi-native` | `contract` | `0.2.0` | `preview` | `yaml`, `json` | 原生 OpenAPI 文档检查；baseline/current comparison；本地 `$ref`；简单 `allOf`；`oneOf/anyOf` 公共字段归一；嵌套 object / `array.items` / `additionalProperties` 路径；`nullable` / `enum` / `default` 值语义；最小 `discriminator` comparison |
| `schema-native` | `schema` | `0.2.0` | `preview` | `sql`, `prisma` | 原生 SQL/Prisma 结构检查；baseline/current comparison；字段删除/类型变化/主键变化/唯一键 drift/可空性收紧；新增必填字段无 default；新增必填字段带 default 分级；enum/default drift |

## Known Boundaries

- `openapi-native` 只比较 `application/json` schema，不处理其他 content type。
- 远程 `$ref` 仍不展开；当前只支持本地 `#/components/schemas/*`。
- `allOf` 仍是保守 merge，不做完整冲突解析。
- `oneOf/anyOf` 当前按“可比较公共字段”处理，不尝试完整 union 兼容性证明。
- `discriminator` 当前只比较 `propertyName` 和 `mapping` key 漂移，不验证映射目标 schema 的语义兼容。
- `schema-native` 仍是启发式 parser，不覆盖所有 SQL 方言。

## Fixture Entrypoints

- `fixtures/artifact-parsers/openapi-minimal.yaml`
- `fixtures/artifact-parsers/openapi-compare-baseline.yaml`
- `fixtures/artifact-parsers/openapi-compare-current.yaml`
- `fixtures/artifact-parsers/openapi-value-semantics-baseline.yaml`
- `fixtures/artifact-parsers/openapi-value-semantics-current.yaml`
- `fixtures/artifact-parsers/openapi-discriminator-baseline.yaml`
- `fixtures/artifact-parsers/openapi-discriminator-current.yaml`
- `fixtures/artifact-parsers/openapi-composed-baseline.yaml`
- `fixtures/artifact-parsers/openapi-composed-current.yaml`
- `fixtures/artifact-parsers/schema-minimal.sql`
- `fixtures/artifact-parsers/schema-minimal.prisma`

## Release Notes

### `openapi-native` `0.2.0`

- comparison 从顶层字段扩到嵌套 object / `array.items` / `additionalProperties` 路径。
- comparison 已支持最小值语义：`nullable` 收紧、`enum` 值删除、`default` 删除/变更。
- comparison 已支持“新增必填字段但带 default”降级提示。
- comparison 已支持最小 `discriminator` 漂移：`propertyName` 变化、mapping 值删除。
- 已补 `discriminator` 与 composed OpenAPI golden fixtures，固定输出顺序。
- success response comparison 已按状态码对齐，不再把 `200` 和 `201` 混成同一 response shape。

### `schema-native` `0.2.0`

- 补齐 `schemaComparisons` 的主键变化、字段/组合唯一键 drift、新增必填字段无 default、带 default 的降级提示、enum drift、default drift。
- 固定最小时间默认值与常见 UUID 默认值函数等价归一，含 Prisma `uuid()` / `dbgenerated("gen_random_uuid()")` 与 `now()` / `dbgenerated("CURRENT_TIMESTAMP")`。
