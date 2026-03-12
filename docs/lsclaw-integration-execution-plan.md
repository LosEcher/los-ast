# lsclaw 集成执行方案（los-ast 侧）

## 目标边界

- 仅增强 `los-ast` 作为证据层与扫描层的稳定能力。
- 不引入编排、账号池、路由治理策略等 `lsclaw` 主控职责。
- 先完成 CLI-first 稳定集成，再扩展 API/service 形态能力。

## 多角色分析结论

### 架构角色

- 生产依赖锁定 Core 层：`/scan` 与 `/discover/symbols`。
- `VPS Agent Web` 作为桥接前缀，默认灰度，不作为首批强依赖。
- 所有改造必须保持 `core` 与 `api` 边界稳定。

### 测试角色

- 新增 `lsclaw adapter smoke`，验证可执行、可扫描、可返回机读结果。
- 将 smoke 纳入 CI，形成基础兼容门禁。
- 为 evidence 产物补字段稳定性断言，防止下游消费回归。

### 治理角色

- 统一契约基线：文档、类型、返回字段对齐。
- 增加最小可回归链路：lint + test + typecheck + smoke。
- 保持可灰度可回滚，不引入破坏性迁移。
- 如消费 `hub-lite` 的 `structure-map.json`，只应把它视为“结构证据 + 最小 Fastify route bind/runtime 分层输出”；完整 route truth 仍需结合 OpenAPI、集成测试或外部 runtime probe 交叉验证。

## 任务拆分与验收

### T1：lsclaw adapter smoke ✅

- 新增 smoke 测试：
  - Core `/scan` 使用 `fixtures/golden/lsclaw-sample`
  - VPS `/vps-agent-web/attribution/analyze` 返回基础分析结构
- 验收：
  - ✅ 本地 `npm run test:api:smoke` 通过
  - ✅ CI 新增 smoke job 并通过

### T2：evidence 契约固化 ✅

- 为 `CodeEvidenceBundle` 增加可消费元信息：
  - `schema_version`
  - `generator`（tool/version）
  - `deterministic`
- 同步 service 赋值与集成测试校验。
- 验收：
  - ✅ 相关测试通过
  - ✅ 下游可稳定读取固定字段

### T3：文档与脚本同步 ✅

- 更新 API 使用文档中的 smoke 执行入口。
- 更新 README 增加执行方案入口。
- 验收：
  - ✅ 文档命令可直接执行
  - ✅ 入口可检索到相关说明

## 本轮实施范围

- 执行 T1 + T2 + T3 的最小闭环，不触及持久化迁移与 provider 真正调用链。

## 集成基线 (Round 1 - los-ast)

### 状态: ✅ 已冻结

**验证结果:**
- `lsclaw-sample` 扫描: 6 findings found (3 in index.ts, 2 in router.ts, 1 in config.ts)
- Golden tests: 7/7 passed
- Integration tests: 5/5 passed
- Type check: No errors

**契约符合度:**
- expected-output.json 匹配实际扫描输出
- scan.ts 和 scan-service.ts 接口稳定
- 文档和模板与实现一致

**允许范围内的修复:**
- fixtures/golden/lsclaw-sample/README.md: 修正 expected findings 行号
