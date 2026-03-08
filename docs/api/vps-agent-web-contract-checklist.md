# VPS Agent Web 对接清单

## 1. 开关与入口

- 环境变量：`ENABLE_VPS_AGENT_WEB_ROUTES=true`
- 路由前缀：`/vps-agent-web`
- 兼容策略：`/experimental/*` 与 `/vps-agent-web/*` 并行

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
| attribution | POST | `/vps-agent-web/attribution/analyze` | preview | 归因分析（当前为模拟结果） |
| recovery | GET | `/vps-agent-web/recovery/stats` | preview | 恢复统计 |

## 3. Scope 约束

- 所有端点都需要 scope。
- GET 端点通过 query `scope` 传 URL 编码 JSON 字符串。
- 写接口建议 body 中提供完整 scope（tenant_id/project_id/actor_id）。

## 4. 迁移步骤

1. 调用方优先接入 `/vps-agent-web/*` 前缀。
2. 迁移期双跑：同请求分别调用新旧前缀比对结果。
3. 验证通过后只保留新前缀，旧前缀进入降级兼容。
