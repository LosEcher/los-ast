# Finding Attribution

更新时间：2026-03-12

本文件说明 `ast`、`contract`、`schema` 三类 finding 在 `/scan` 聚合阶段的当前策略。

## Source Policy

- `ast` findings 来自 `core.scan()`。
- `contract` findings 来自 `openApiDocuments`、`openApiComparisons`、`contractArtifacts`。
- `schema` findings 来自 `schemaDocuments`、`schemaComparisons`、`schemaArtifacts`。

## Dedup Policy

- 会做 source 内部去重：
  - native parser 产物和 passthrough artifact 按稳定 payload key 去重；
  - 同一 source 下若 native 与 passthrough 等价，保留后者元数据。
- 不做跨 source 去重：
  - `ast` 与 `contract/schema` 即使描述同一问题，也保留为独立 finding；
  - 这样下游可以区分“代码证据”和“契约/结构证据”。

## Ordering Policy

- `deterministic=true` 时，聚合结果按以下顺序稳定排序：
  - `file`
  - `range.start`
  - `findingSource`，当前固定为 `ast -> contract -> schema`
  - `ruleId`
  - `fingerprint`
- 这条规则用于避免同位置多来源 finding 依赖运行时插入顺序。

## Consumer Guidance

- 如果下游要做聚合或展示，应至少保留：
  - `findingSource`
  - `ruleId`
  - `file`
  - `range`
- 如果下游要做 source 合并视图，应把它视为“展示层派生”，不要覆盖原始 finding。
