# lsclaw Governance Ruleset

Version: 0.2.0
Status: preview
Last Updated: 2026-03-12
Owner: los-ast / platform

## Purpose

该规则集用于给 `lsclaw`、`VPS Agent Web` 及类似项目提供最小可用的治理扫描能力。

当前覆盖：

- frontend
- backend
- database
- interface
- security

当前不覆盖：

- OpenAPI 原生契约解析
- SQL / Prisma 原生 schema 解析
- 规则包签名与远程发布

## Files

- `frontend-interface.yml`
- `backend-interface.yml`
- `database-safety.yml`
- `field-contract-readability.yml`
- `security-no-eval-js.yml`
- `security-no-eval-ts.yml`

## Load Path

该规则集可通过以下模式加载：

```text
rules/projects/lsclaw-governance/**/*.yml
```

API 内置规则包别名：

```text
lsclaw-governance
```

规则来源追溯、`ruleFile` 注入与发布/装载链路说明：

- `docs/rules/RULE_TRACEABILITY.md`

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
  - `window.fetch(url)`
  - `window.fetch(url, options)`
  - `axios.get(url)`
  - `axios.get(url, args)` 及其他已声明 method
  - `apiClient.post(url, args)` / `client.get(url)`
  - `requestClient.patch(url, args)` / `restClient.delete(url)`
  - 受限泛化对象名，如 `billingApi.get(url)` / `requestGateway.post(url, args)`
  - `const http = axios; http.get(url)`
- 当前不覆盖以下场景：
  - 任意自定义对象名的 `.get/.post/...`，例如 `metricsClient.getGauge(...)`
  - 更高层的自定义网络层封装识别

## Fixture Baseline

- 固定回归样例：`fixtures/golden/lsclaw-governance-pack/`
- 回归入口：`node --test test/rules.test.mjs`
- 当前整包命中阈值：
  - total findings = `5`
  - severity: `error=1`, `warning=3`, `info=1`
  - impactHint: `high=1`, `medium=3`, `low=1`
- 如果规则语义需要调整，必须同步更新 fixture、测试断言与本文件中的基线说明。

## Evolution

下一阶段计划：

1. 增加 contract 规则映射规范，对接 OpenAPI / JSON Schema 输入。
2. 增加 schema 规则映射规范，对接 SQL / Prisma 输入。
3. 在 fixture 基线上继续补版本发布说明与更细粒度的 threshold 监控。
