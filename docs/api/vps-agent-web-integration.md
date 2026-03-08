# VPS Agent Web 集成说明

## 启用方式

设置环境变量后重启 API：

```bash
export ENABLE_VPS_AGENT_WEB_ROUTES=true
```

启用后会注册统一前缀：

- `/vps-agent-web/incidents`
- `/vps-agent-web/attribution`
- `/vps-agent-web/recovery`
- `/vps-agent-web/approvals`

## 兼容矩阵（当前实现）

| 域 | 稳定级别 | 说明 |
|---|---|---|
| approvals | beta | 已有 scope 隔离与审批状态流，适合作为首批集成端点 |
| incidents | preview | 具备查询与采集能力，建议作为受控灰度能力 |
| attribution | preview | `analyze` 当前为模拟分析结果，建议灰度使用 |
| recovery | preview | 执行动作仍偏实验性质，建议内部或灰度使用 |

## 与 experimental 路由关系

- 本路由组复用现有业务处理逻辑，属于稳定前缀封装。
- `experimental` 前缀继续保留用于兼容现有调用方。
- 两套前缀可并行启用，便于迁移期间双跑验证。

## 相关文档

- 对接清单：`docs/api/vps-agent-web-contract-checklist.md`
- 请求示例与错误码映射：`docs/api/vps-agent-web-examples-errors.md`
