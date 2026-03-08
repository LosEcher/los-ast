# VPS Agent Web 请求示例与错误码映射

## 1. 基础约定

- 基础地址：`http://localhost:3000`
- 路由前缀：`/vps-agent-web`
- 启用开关：`ENABLE_VPS_AGENT_WEB_ROUTES=true`
- `scope` 传递：
  - GET：使用 query 参数 `scope`，值为 URL 编码 JSON
  - POST：放在 body 的 `scope` 字段

示例 scope：

```json
{
  "tenant_id": "tenant-001",
  "project_id": "project-001",
  "actor_id": "actor-001",
  "mode": "service"
}
```

## 2. 请求示例（可直接联调）

### 2.1 Approvals（beta）

查询审批项：

```bash
curl -G "http://localhost:3000/vps-agent-web/approvals" \
  --data-urlencode 'scope={"tenant_id":"tenant-001","project_id":"project-001","actor_id":"actor-001","mode":"service"}' \
  --data-urlencode 'status=pending'
```

创建审批项：

```bash
curl -X POST "http://localhost:3000/vps-agent-web/approvals" \
  -H "Content-Type: application/json" \
  -d '{
    "scope": {
      "tenant_id": "tenant-001",
      "project_id": "project-001",
      "actor_id": "actor-001",
      "mode": "service"
    },
    "item_type": "recovery_action",
    "item_id": "act-001",
    "title": "批准恢复动作",
    "description": "重启关键服务实例",
    "risk_level": "medium",
    "timeout_seconds": 600
  }'
```

处理审批项：

```bash
curl -X POST "http://localhost:3000/vps-agent-web/approvals/{approval_id}/process" \
  -H "Content-Type: application/json" \
  -d '{
    "scope": {
      "tenant_id": "tenant-001",
      "project_id": "project-001",
      "actor_id": "actor-001",
      "mode": "service"
    },
    "action": "approve",
    "actor_id": "actor-approver-001",
    "comment": "通过"
  }'
```

审批统计：

```bash
curl -G "http://localhost:3000/vps-agent-web/approvals/stats" \
  --data-urlencode 'scope={"tenant_id":"tenant-001","project_id":"project-001","actor_id":"actor-001","mode":"service"}'
```

### 2.2 Incidents（preview）

存储统计：

```bash
curl -G "http://localhost:3000/vps-agent-web/incidents/stats/store" \
  --data-urlencode 'scope={"tenant_id":"tenant-001","project_id":"project-001","actor_id":"actor-001","mode":"service"}'
```

采集统计：

```bash
curl -G "http://localhost:3000/vps-agent-web/incidents/stats/collection" \
  --data-urlencode 'scope={"tenant_id":"tenant-001","project_id":"project-001","actor_id":"actor-001","mode":"service"}'
```

### 2.3 Attribution（preview）

归因分析：

```bash
curl -X POST "http://localhost:3000/vps-agent-web/attribution/analyze" \
  -H "Content-Type: application/json" \
  -d '{
    "scope": {
      "tenant_id": "tenant-001",
      "project_id": "project-001",
      "actor_id": "actor-001",
      "mode": "service"
    },
    "incident_id": "inc-001",
    "evidence_bundle_id": "bundle-001"
  }'
```

### 2.4 Recovery（preview）

恢复统计：

```bash
curl -G "http://localhost:3000/vps-agent-web/recovery/stats" \
  --data-urlencode 'scope={"tenant_id":"tenant-001","project_id":"project-001","actor_id":"actor-001","mode":"service"}'
```

## 3. 错误码映射表（网关/前端）

| HTTP | category | code | 常见触发场景 | 建议处理 |
|---|---|---|---|---|
| 400 | VALIDATION | `MISSING_SCOPE` | 未提供 scope 或 query scope 非法 JSON | 直接修正请求参数，不重试 |
| 400 | VALIDATION | `INCOMPLETE_SCOPE` | 写接口缺少 tenant/project/actor | 补齐 scope 字段后重试 |
| 400 | VALIDATION | `APPROVAL_PROCESS_FAILED` | 审批处理状态不合法或业务校验失败 | 提示用户修正操作，再次提交 |
| 403 | SCOPE | `INCOMPLETE_SCOPE` | 生产环境 scope 不完整 | 使用完整 service scope 重新发起 |
| 403 | SCOPE | `LOCAL_SCOPE_FORBIDDEN` | 生产环境传 `mode=local` | 改为 `mode=service` |
| 404 | NOT_FOUND | `RESOURCE_NOT_FOUND` | 资源 ID 不存在或跨租户不可见 | 提示不存在或无权限，不重试 |
| 404 | NOT_FOUND | `ROUTE_NOT_FOUND` | 路径错误或路由未启用 | 检查路径和 `ENABLE_VPS_AGENT_WEB_ROUTES` |
| 500 | INTERNAL | `INTERNAL_ERROR` | 服务内部异常 | 指数退避重试并告警 |

## 4. 标准错误响应示例

```json
{
  "error": {
    "category": "VALIDATION",
    "code": "MISSING_SCOPE",
    "message": "Scope is required in request body or query parameters",
    "requestId": "req-123",
    "timestamp": "2026-03-08T15:30:00.000Z",
    "retryable": false
  }
}
```

## 5. 网关映射建议

- 按 `error.category` 建立统一告警分桶：`VALIDATION/SCOPE/NOT_FOUND/INTERNAL`
- 把 `error.requestId` 透传到前端日志，便于端到端排障
- 仅对 `TIMEOUT` 或 5xx 做自动重试，4xx 不做自动重试
