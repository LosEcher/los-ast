# API_CONTRACT 入口说明

`lsclaw` 与 `los-ast` 约定的 `API Contract` 说明目前位于：

- `packages/api/docs/api/API_CONTRACT.md`

该文档当前覆盖稳定能力中的 `/scan` 契约、错误码分层与稳定性承诺。

> 提示：在身份链路收口后，`/scan` 的请求身份来源将以 `Authorization: Bearer <jwt>` 为主；`scope` 为兼容上下文字段，生产环境以 JWT 派生为准。

当前稳定面建议只按以下端点理解：

- `GET /healthz/live`
- `GET /healthz/ready`
- `POST /scan`
- `POST /discover/symbols`

以下端点或能力不应视为长期冻结契约：

- `/experimental/*`
- `/vps-agent-web/*`
- incident / approval / attribution / recovery / memory proposal 相关流程

服务降级统一契约见：

- `docs/service-readiness-degradation-contract.md`

当前执行优先级与边界收口见：

- `docs/ACTIVE_TODO.md`
