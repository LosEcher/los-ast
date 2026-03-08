# los-ast 两周优化落地计划

## 目标

- 修复文档与实现不一致问题，降低联调认知成本。
- 收敛 VPS Agent Web 对外契约，确保可灰度、可回滚。
- 强化流水线质量门，形成可持续交付基线。

## 范围与优先级

### P0（本周必须完成）

1. 补齐 `.env.example` 中 VPS Agent Web 开关配置。
2. 修正 API 使用文档中的路由分层与错误码命名。
3. 校准 OpenAPI 与已公开路由能力的一致性说明。

### P1（第二周完成）

1. CI 增加 build/lint 独立质量门并与测试并行执行。
2. 对 VPS Agent Web 的 preview 端点补充 scope 隔离测试。
3. 完善架构文档，补齐 API/shared 现状与边界定义。

### P2（排期准备）

1. 审批/事件/恢复存储从内存迁移到持久化。
2. 归因分析从模拟实现升级为真实 provider 调用链。

## 两周排期

### Week 1（治理一致性）

- D1-D2：完成文档与配置修复（P0-1/P0-2）。
- D3：补充 OpenAPI 与对接文档一致性说明（P0-3）。
- D4：执行 lint/test/typecheck 回归，整理发布说明。
- D5：联调验证（lsclaw 扫描链路 + VPS approvals beta 路径）。

### Week 2（质量门与集成可靠性）

- D1-D2：补 CI 质量门并更新 workflow 文档（P1-1）。
- D3-D4：补 scope 隔离与路由契约测试（P1-2）。
- D5：架构文档同步与风险复盘（P1-3）。

## 验收标准

- 文档验收：
  - API 文档中路由分层、错误码、开关变量与代码一致。
  - OpenAPI 与对外宣称端点覆盖一致。
- 质量验收：
  - `npm run lint`、`npm run test`、`cd packages/api && npm run typecheck` 全通过。
  - CI 中包含 lint/build/test/typecheck 质量门。
- 集成验收：
  - lsclaw 可稳定调用 `/scan` 与 `/discover/symbols`。
  - VPS Agent Web 在 `ENABLE_VPS_AGENT_WEB_ROUTES=true` 下完成 approvals 联调。

## 风险与回滚

- 风险：文档修正后暴露更多契约差异，导致短期改动增多。
- 风险：CI 质量门增多后，历史技术债会使构建首次变红。
- 回滚策略：优先回滚文档入口与开关说明；代码侧保持最小增量并以独立提交回退。
