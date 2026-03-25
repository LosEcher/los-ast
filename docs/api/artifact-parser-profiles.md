# Artifact Parser Profiles

本文件描述 `packages/api/src/services/artifact-parsers/registry.ts` 中注册的原生输入解析 profile。

## 目标

- 让 `scan-service` 只负责 orchestration。
- 让新增输入源通过 profile 注册，而不是继续修改主流程。
- 为每个 parser 固定能力范围、限制和 fixture 样例。

## 当前 Profiles

### `openapi-native`

- `version`: `0.2.0`
- `stability`: `preview`
- `findingSource`: `contract`
- `acceptedFormats`: `yaml`, `json`
- 当前检查：
  - 缺少 `operationId`
  - 变更类接口缺少 `security`
  - 缺少成功响应声明
  - baseline/current 对比下的 operation 删除、请求字段删除/类型变化/必填新增
  - baseline/current 对比下的 success response 状态码删除、响应字段删除/类型变化、response required -> optional
  - 嵌套 object / `array.items` / `additionalProperties` 路径 comparison
  - `nullable` / `enum` / `default` 值语义 comparison
  - 保守 validation 语义 comparison：`min/max*`、`pattern`、`format`、`multipleOf`、exclusive min/max
  - 最小 `discriminator` comparison
- 当前限制：
  - 仅做启发式定位
  - 不解析远程 `$ref`
  - 对比依赖调用方提供 baseline/current 对
  - 仅比较 `application/json` schema
  - `oneOf/anyOf` 仍只按公共可比较字段归一
- fixture：
  - `fixtures/artifact-parsers/openapi-minimal.yaml`
  - `fixtures/artifact-parsers/openapi-minimal.expected.json`
  - `fixtures/artifact-parsers/openapi-compare-baseline.yaml`
  - `fixtures/artifact-parsers/openapi-compare-current.yaml`
  - `fixtures/artifact-parsers/openapi-compare.expected.json`
  - `fixtures/artifact-parsers/openapi-value-semantics-baseline.yaml`
  - `fixtures/artifact-parsers/openapi-value-semantics-current.yaml`
  - `fixtures/artifact-parsers/openapi-value-semantics.expected.json`
  - `fixtures/artifact-parsers/openapi-discriminator-baseline.yaml`
  - `fixtures/artifact-parsers/openapi-discriminator-current.yaml`
  - `fixtures/artifact-parsers/openapi-discriminator.expected.json`
  - `fixtures/artifact-parsers/openapi-composed-baseline.yaml`
  - `fixtures/artifact-parsers/openapi-composed-current.yaml`
  - `fixtures/artifact-parsers/openapi-composed.expected.json`
- enable flag：
  - `ENABLE_OPENAPI_NATIVE_PARSER=true|false`

### `schema-native`

- `version`: `0.2.0`
- `stability`: `preview`
- `findingSource`: `schema`
- `acceptedFormats`: `sql`, `prisma`
- 当前检查：
  - 缺少主键
  - 敏感字段可空
  - 生命周期字段缺少默认值
  - 审计时间字段缺少默认值
  - baseline/current 对比下的字段删除
  - baseline/current 对比下的类型变化
  - baseline/current 对比下的保守 SQL widening 分级
  - baseline/current 对比下的主键变化
  - baseline/current 对比下的字段级 unique 与组合唯一键 drift
  - baseline/current 对比下的可空到必填收紧
  - baseline/current 对比下的必填到可空放宽 warning
  - baseline/current 对比下的新增必填字段带 default 分级
  - baseline/current 对比下的 enum 值删除
  - baseline/current 对比下的默认值新增/删除/变化分级
- 当前限制：
  - 仅做启发式解析
  - enum 仅支持 inline SQL `enum(...)` 与 Prisma `enum` block
  - 默认值比较只做保守函数等价与分级判断（如 `CURRENT_TIMESTAMP` / `now()`、`uuid_generate_v4()` / `gen_random_uuid()`、`autoincrement()` / `nextval(...)`）
  - 类型等价与 widening 分级只覆盖少量保守 SQL/Postgres 场景，不尝试做完整方言兼容性证明
- fixture：
  - `fixtures/artifact-parsers/schema-minimal.sql`
  - `fixtures/artifact-parsers/schema-minimal.prisma`
  - `fixtures/artifact-parsers/schema-compare-baseline.prisma`
  - `fixtures/artifact-parsers/schema-compare-current.prisma`
  - `fixtures/artifact-parsers/schema-minimal-sql.expected.json`
  - `fixtures/artifact-parsers/schema-minimal-prisma.expected.json`
  - `fixtures/artifact-parsers/schema-compare.expected.json`
- enable flag：
  - `ENABLE_SCHEMA_NATIVE_PARSER=true|false`

## 扩展规则

新增 parser profile 时，至少补齐：

1. `registry.ts` 中的 profile 元数据
2. 对应 parser 实现
3. 至少一个 unit test
4. 至少一个 fixture 样例
5. 本文档中的能力说明

## Runtime Governance

- parser profile 默认启用，但可通过环境变量关闭。
- 关闭某个 native parser 不会影响直通模式：
  - `contractArtifacts`
  - `schemaArtifacts`
- 建议灰度策略：
  - 新 parser 先以 `preview` 发布
  - 通过环境变量开关做灰度
  - 稳定后再提升为 `stable`

## Golden Baseline

- parser profile 的最小稳定基线位于：
  - `packages/api/tests/golden/artifact-parser-golden.test.ts`
- 这些 golden 只验证 parser 输出规则集是否稳定，不替代更高层的 API / core golden。
