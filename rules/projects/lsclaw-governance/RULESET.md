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
- `frontend-interface.yml` 当前拆分为两条前端 HTTP 调用治理规则：
  - `lsclaw-governance.frontend-http-client`：匹配直接 `fetch(...)` 调用。
  - `lsclaw-governance.frontend-http-client-axios`：匹配直接 `axios.{get,post,put,patch,delete}(...)` 调用。
- axios method 约束仅作用于 axios 规则，不再与 `fetch` 分支共享约束上下文。

## Current Coverage Notes

- 当前前端 HTTP 治理规则覆盖常见直接调用形态：
  - `fetch(url)`
  - `fetch(url, options)`
  - `axios.get(url)`
  - `axios.get(url, args)` 及其他已声明 method
- 当前不覆盖以下场景：
  - `window.fetch(...)`
  - `client.get(...)` / `apiClient.post(...)`
  - `const http = axios; http.get(...)`
  - 更高层的自定义网络层封装识别

## Evolution

下一阶段计划：

1. 增加 contract 规则映射规范，对接 OpenAPI / JSON Schema 输入。
2. 增加 schema 规则映射规范，对接 SQL / Prisma 输入。
3. 增加规则集版本发布说明与 fixtures 回归基线。
