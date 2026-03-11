# Artifact Parser Profiles

本文件描述 `packages/api/src/services/artifact-parsers/registry.ts` 中注册的原生输入解析 profile。

## 目标

- 让 `scan-service` 只负责 orchestration。
- 让新增输入源通过 profile 注册，而不是继续修改主流程。
- 为每个 parser 固定能力范围、限制和 fixture 样例。

## 当前 Profiles

### `openapi-native`

- `version`: `0.1.0`
- `stability`: `preview`
- `findingSource`: `contract`
- `acceptedFormats`: `yaml`, `json`
- 当前检查：
  - 缺少 `operationId`
  - 变更类接口缺少 `security`
  - 缺少成功响应声明
- 当前限制：
  - 仅做启发式定位
  - 不解析远程 `$ref`
  - 不做字段级兼容性分析
- fixture：
  - `fixtures/artifact-parsers/openapi-minimal.yaml`
- enable flag：
  - `ENABLE_OPENAPI_NATIVE_PARSER=true|false`

### `schema-native`

- `version`: `0.1.0`
- `stability`: `preview`
- `findingSource`: `schema`
- `acceptedFormats`: `sql`, `prisma`
- 当前检查：
  - 缺少主键
  - 敏感字段可空
- 当前限制：
  - 仅做启发式解析
  - 不做跨版本对比
  - 不做 breaking change 分级
- fixture：
  - `fixtures/artifact-parsers/schema-minimal.sql`
  - `fixtures/artifact-parsers/schema-minimal.prisma`
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
