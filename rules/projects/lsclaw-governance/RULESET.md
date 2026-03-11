# lsclaw Governance Ruleset

Version: 0.1.0
Status: preview
Last Updated: 2026-03-11
Owner: los-ast / platform

## Purpose

该规则集用于给 `lsclaw`、`VPS Agent Web` 及类似项目提供最小可用的治理扫描能力。

当前覆盖：

- frontend
- backend
- database
- interface

当前不覆盖：

- OpenAPI 原生契约解析
- SQL / Prisma 原生 schema 解析
- 规则包签名与远程发布

## Files

- `frontend-interface.yml`
- `backend-interface.yml`
- `database-safety.yml`
- `field-contract-readability.yml`

## Load Path

该规则集可通过以下模式加载：

```text
rules/projects/lsclaw-governance/**/*.yml
```

API 内置规则包别名：

```text
lsclaw-governance
```

## Rule Semantics

- 该规则集当前全部属于代码层 AST finding。
- `governance.domain` 用于标识治理域。
- `governance.owner` 用于标识责任团队。
- `governance.impact` 用于标识风险提示。

## Evolution

下一阶段计划：

1. 增加 contract 规则映射规范，对接 OpenAPI / JSON Schema 输入。
2. 增加 schema 规则映射规范，对接 SQL / Prisma 输入。
3. 增加规则集版本发布说明与 fixtures 回归基线。
