# Service Readiness & Explicit Degradation Contract

## Scope

适用于依赖 los-ast 的上层调用方（如 `lsclaw`、`vps-agent-web`）以及网关/客户端 SDK。

## 统一降级触发条件

- 当 Core 未就绪时，端点必须返回
  - HTTP `503`
  - `error.category = SERVICE_UNAVAILABLE`
  - `error.code = CORE_NOT_READY`
  - `error.details.reason = "core_not_ready"`
- 典型受影响端点（含本契约外延）
  - `POST /scan`
  - `POST /discover/symbols`
  - 其他调用到 Core 的延伸端点（如果返回该语义）

## 请求方处理行为（强约束）

1. 遇到该错误时，**不得**静默切换到其他分析路径。
2. 标记为“依赖不可用/降级中”，进行重试前先做就绪探测：
   - 调用 `GET /healthz/ready`
   - 仅当返回 `status = "ready"` 时才发起下一次业务重试
3. 重试策略建议：
   - 首次 1~2 秒抖动退避
   - 每次退避逐级递增（指数或固定）
   - 默认上限 5 次失败后上报告警并人工接管
4. 错误上报需透传 `error.requestId`，用于跨服务链路追踪。

## 示例（错误响应）

```json
{
  "error": {
    "category": "SERVICE_UNAVAILABLE",
    "code": "CORE_NOT_READY",
    "message": "Core is not ready",
    "requestId": "req-123",
    "timestamp": "2026-03-11T12:00:00.000Z",
    "retryable": true,
    "details": {
      "reason": "core_not_ready"
    }
  }
}
```
