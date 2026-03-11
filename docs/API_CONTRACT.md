# API_CONTRACT 入口说明

`lsclaw` 与 `los-ast` 约定的 `API Contract` 说明目前位于：

- `packages/api/docs/api/API_CONTRACT.md`

该文档覆盖 `/scan` 的核心返回格式、错误码分层与稳定性承诺。

> 提示：在身份链路收口后，`/scan` 的请求身份来源将以 `Authorization: Bearer <jwt>` 为主；`scope` 为兼容上下文字段，生产环境以 JWT 派生为准。

服务降级统一契约见：

- `docs/service-readiness-degradation-contract.md`
