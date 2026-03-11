# VPS Agent Web 对接清单

## 1. 开关与入口

- 环境变量：`ENABLE_VPS_AGENT_WEB_ROUTES=true`，`ATTRIBUTION_PROVIDER=lsclaw`
- 原生 parser 开关：`ENABLE_OPENAPI_NATIVE_PARSER=true`、`ENABLE_SCHEMA_NATIVE_PARSER=true`
- 路由前缀：`/vps-agent-web`
- 兼容策略：`/experimental/*` 与 `/vps-agent-web/*` 并行
- 稳定证据入口：`/scan`、`/discover/symbols`

## 2. 契约清单

| 域 | 方法 | 路径 | 稳定级别 | 说明 |
|---|---|---|---|---|
| approvals | GET | `/vps-agent-web/approvals` | beta | 分页查询审批项 |
| approvals | POST | `/vps-agent-web/approvals` | beta | 创建审批项 |
| approvals | GET | `/vps-agent-web/approvals/{id}` | beta | 获取审批项详情 |
| approvals | POST | `/vps-agent-web/approvals/{id}/process` | beta | 审批通过/拒绝 |
| approvals | GET | `/vps-agent-web/approvals/stats` | beta | 审批统计 |
| incidents | GET | `/vps-agent-web/incidents/stats/store` | preview | 存储统计 |
| incidents | GET | `/vps-agent-web/incidents/stats/collection` | preview | 采集统计 |
| attribution | POST | `/vps-agent-web/attribution/analyze` | preview | 归因分析（可插拔 provider，结果持久化） |
| recovery | GET | `/vps-agent-web/recovery/stats` | preview | 恢复统计 |

## 3. Scope 约束

- 所有端点都要求具备可验证身份来源，建议优先使用 `Authorization: Bearer <jwt>`。
- 在生产态 JWT 模式下，`scope` 由服务端 `identity` 插件从 JWT claims 派生，应用于租户隔离；
  兼容期可继续接收客户端 `scope`，但必须与 `scope` 校验通过（`tenant_id`、`project_id`、`actor_id` 必须一致）。
- GET 端点的 `scope` query 为兼容参数，作为非生产场景 fallback；生产路径可不传。
- 写接口如 `POST /approvals` / `POST /attribution/analyze` 以 JWT 的派生 `scope` 为权威上下文。
- incidents/recovery/attribution 的 stats 返回按实际 `scope`（服务端派生）做租户隔离后的统计结果。
- 就绪/降级策略：所有调用 Core 的联调链路遵循统一 `SERVICE_UNAVAILABLE + CORE_NOT_READY` 契约，先 `GET /healthz/ready` 再重试，详见  
  [Service Readiness & Explicit Degradation Contract](../service-readiness-degradation-contract.md)。

## 4. 迁移步骤

1. 代码/接口/字段治理优先接入 `/scan`，不要把 preview 路由当稳定扫描入口。
2. 审批/事件/归因/恢复场景再按需接入 `/vps-agent-web/*`。
3. 迁移期双跑：对 preview 流程同时调用 `/experimental/*` 与 `/vps-agent-web/*` 比对结果。
4. 验证通过后保留 `/vps-agent-web/*`，旧前缀进入降级兼容。

## 5. 当前已验证基线

2026-03-11 已完成针对以下链路的自测：

- `openApiDocuments -> contract findings`
- `schemaDocuments -> schema findings`
- parser runtime 开关
- `/scan` contract / integration
- parser golden baseline

结果：`70/70` 通过。
