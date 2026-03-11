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

## 推荐集成姿势

`VPS Agent Web` 与 `los-ast` 的推荐协作方式现在分两层：

1. 稳定证据层：调用 `/scan` / `/discover/symbols`
2. 迁移兼容层：调用 `/vps-agent-web/*`

建议：

- 代码、接口、字段证据统一走 `/scan`
- 审批、事件、归因、恢复等兼容流程仍按 `/vps-agent-web/*` 灰度使用

### 证据层输入建议

- 代码治理：常规 `rules` / `rulePack`
- 接口治理：`openApiDocuments`
- 字段治理：`schemaDocuments`

### Runtime 开关

- `ENABLE_VPS_AGENT_WEB_ROUTES=true`
- `ENABLE_OPENAPI_NATIVE_PARSER=true|false`
- `ENABLE_SCHEMA_NATIVE_PARSER=true|false`

说明：

- parser 开关只影响 `/scan` 的 native input 解析
- 不影响 `contractArtifacts` / `schemaArtifacts` passthrough

## 与 experimental 路由关系

- 本路由组复用现有业务处理逻辑，属于稳定前缀封装。
- `experimental` 前缀继续保留用于兼容现有调用方。
- 两套前缀可并行启用，便于迁移期间双跑验证。
- OpenAPI 当前仅收录对外承诺的契约子集，未列出的镜像端点视为兼容层能力，不纳入稳定承诺。

## 相关文档

- 对接清单：`docs/api/vps-agent-web-contract-checklist.md`
- 请求示例与错误码映射：`docs/api/vps-agent-web-examples-errors.md`
- Parser Profiles：`docs/api/artifact-parser-profiles.md`

## 当前验证状态

2026-03-11 已完成一轮针对性自测，覆盖 `/scan` native input、parser registry、contract/integration/golden。

结果：

- `7` 个测试文件
- `70` 个测试全部通过
