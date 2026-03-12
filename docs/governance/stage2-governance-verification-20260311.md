# lsclaw / VPS Agent Web 治理能力落地 Stage 2 验证证明（2026-03-12）

## 目标

- 固定 `lsclaw-governance` 规则包的最小整包回归基线，避免规则漂移只体现在零散单测中。
- 固定 `/scan` 在 `contract + schema` 组合输入场景下的通道隔离行为，确保 `findingSource`、`language`、`file` 与 `ruleId` 前缀不串。
- 以可执行命令与可定位路径的形式产出本阶段演进证明，并进入后续 P2 跟踪。

## 本轮新增证据

1. 规则包整包基线
- 新增 fixture：`fixtures/golden/lsclaw-governance-pack/`
- 基线文件：`fixtures/golden/lsclaw-governance-pack/expected-output.json`
- 规则集说明：`rules/projects/lsclaw-governance/RULESET.md`
- 核心断言入口：`test/rules.test.mjs`
- 当前固定阈值：
  - total findings = `5`
  - severity = `error:1`, `warning:3`, `info:1`
  - impactHint = `high:1`, `medium:3`, `low:1`

2. contract/schema 组合输入验收
- service 层真实解析断言：`packages/api/tests/unit/services/scan-service.test.ts`
- integration 层路由转发断言：`packages/api/tests/integration/api.test.ts`
- contract 层响应字段断言：`packages/api/tests/contract/contract.test.ts`
- 当前固定结论：
  - `/scan` 同时接收 `openApiDocuments` 与 `schemaDocuments` 时，两路输入都会被传入 service。
  - 响应中 `contract` findings 与 `schema` findings 继续保留各自的 `findingSource`、`language`、`file` 与 `ruleId` 命名空间。

3. route evidence 回归补证
- runtime probe 修复文件：`packages/cli/src/export-artifacts.mjs`
- 验收文档：`docs/hub-lite-route-evidence-acceptance.md`
- 当前结论：
  - runtime probe 已补齐 `cancellationPlugin` 装配。
  - `hub-lite route evidence` 当前可按 `repo_gate_green` 理解。

## 执行命令

本轮用于固定阶段结论的命令如下：

```bash
node --test ./test/hub-lite-artifacts.test.mjs
node --test test/rules.test.mjs
cd packages/api && npm run test -- --run tests/unit/services/scan-service.test.ts
cd packages/api && npm run test -- --run tests/integration/api.test.ts tests/contract/contract.test.ts
npm run test
npm run quality-gate
```

## 输出路径

- 规则包基线输出：`fixtures/golden/lsclaw-governance-pack/expected-output.json`
- 阶段规则集说明：`rules/projects/lsclaw-governance/RULESET.md`
- route evidence 验收说明：`docs/hub-lite-route-evidence-acceptance.md`
- 性能基线既有产物：`logs/scan-benchmark-20260311.json`
- 本阶段证明：`docs/governance/stage2-governance-verification-20260311.md`

## 验收结果

- `node --test ./test/hub-lite-artifacts.test.mjs`：PASS（`15/15`）
- `node --test test/rules.test.mjs`：PASS（`11/11`）
- `cd packages/api && npm run test -- --run tests/unit/services/artifact-parsers.test.ts tests/unit/services/scan-service.test.ts`：PASS（`66/66`）
- `npm run test`：PASS（core `11` tests + api `21` files / `223` tests）
- `npm run build:api`：PASS

## 本阶段闭环结论

- `lsclaw-governance` 不再只有零散规则单测，已经具备最小整包 fixture 基线。
- `contract/schema` 输入链路不再只有单通道验收，已经具备组合场景的 service + integration + contract 三层证据。
- 当前剩余工作不在“是否能用”，而在：
  - `route_binds` 更复杂 gate 与跨框架边界的继续补源；
  - contract/schema 规则能力的继续扩展；
  - 24h 泄漏压测与长期性能基线。
