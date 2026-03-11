# VPS Agent Web 集成说明

> 当前状态：预览集成层。该路由组适合作为迁移期兼容入口，不应作为 `los-ast` 的长期稳定能力边界来理解。

## 启用方式

设置环境变量后重启 API：

```bash
export ENABLE_VPS_AGENT_WEB_ROUTES=true
export ATTRIBUTION_PROVIDER=lsclaw
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
| attribution | preview | `analyze` 使用可插拔 provider（默认 lsclaw），分析结果会持久化到归因存储 |
| recovery | preview | 执行动作仍偏实验性质，建议内部或灰度使用 |

## 边界说明

- 本路由组是为了配合 `VPS Agent Web` 集成验证而保留的兼容封装。
- 它不改变 `los-ast` 的核心定位：`los-ast` 仍应主要承担代码扫描、结构发现、finding 输出与证据生成。
- 若相关域长期存在并走向持久化/编排化，应优先迁往独立控制面或上层服务，而不是继续扩张到 `los-ast` 内核边界中。

## 与 experimental 路由关系

- 本路由组复用现有业务处理逻辑，属于稳定前缀封装。
- `experimental` 前缀继续保留用于兼容现有调用方。
- 两套前缀可并行启用，便于迁移期间双跑验证。
- OpenAPI 当前仅收录对外承诺的契约子集，未列出的镜像端点视为兼容层能力，不纳入稳定承诺。

## 相关文档

- 对接清单：`docs/api/vps-agent-web-contract-checklist.md`
- 请求示例与错误码映射：`docs/api/vps-agent-web-examples-errors.md`
