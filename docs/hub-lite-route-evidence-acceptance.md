# Hub-Lite Route Evidence 验收说明

更新时间：2026-03-11

## 目的

本说明用于约束 `hub-lite` 路由证据链的阶段性测试与验收，不把“局部能力完成”误写成“全仓完全就绪”。

当前验收对象：

- `route_declares`
- `route_mounts`
- `route_binds`
- `route_runtime`
- `route_runtime_deltas`
- `control_flow_guard` 及其 `guardShape / additionalConditions`

## 验收分层

### L1: 变更内核验收

目标：确认 `export-artifacts` 的静态 / 运行时证据链没有回退。

执行命令：

```bash
node --test ./test/hub-lite-artifacts.test.mjs
```

通过标准：

- 全部通过
- 覆盖最小 register-chain、prefix alias、template prefix
- 覆盖 default wiring runtime probe 与 flag-enabled runtime probe
- 覆盖 alias guard、block guard、early-return guard
- 覆盖 `else / else if`
- 覆盖简单 `&& / ||`
- 覆盖 wrapped compound condition
- 覆盖同文件 helper gate 正例与 unsafe helper 负例

当前基线：

- 2026-03-11：`13/13` 通过

### L2: 构建验收

目标：确认 API 构建产物没有被本轮改动打坏。

执行命令：

```bash
npm run build:api
```

通过标准：

- TypeScript 构建通过
- `packages/api/dist` 成功刷新

当前基线：

- 2026-03-11：通过

### L3: API 行为验收

目标：确认 route/control-flow 相关改动没有破坏 API 合同、集成与 smoke。

执行命令：

```bash
npm run test:api
```

通过标准：

- Vitest 全量通过
- contract / integration / smoke / unit / golden 均完成

当前基线：

- 2026-03-11：`21` files, `166` tests 全部通过

### L4: 仓库级门禁验收

目标：确认本仓库默认测试入口整体可绿。

执行命令：

```bash
npm run test
```

通过标准：

- `test:core`
- `test:api`

当前状态：

- 2026-03-11：未通过
- 阻塞点：`test/rules.test.mjs`
- 失败用例：`governance metadata is projected into scan findings`
- 结论：该阻塞不属于本轮 `hub-lite route evidence` 改动直接引入，但会阻止“仓库级完全验收”成立

## 阶段完成判定

定义三个完成级别：

1. `phase_complete_local`
- 条件：L1 + L2 通过
- 用途：允许继续扩展同一能力线

2. `phase_complete_verifiable`
- 条件：L1 + L2 + L3 通过
- 用途：允许合并该能力线并作为阶段性交付输出

3. `repo_gate_green`
- 条件：L1 + L2 + L3 + L4 通过
- 用途：允许作为仓库级 release / quality-gate 前置结论

## 当前结论

当前 `hub-lite route evidence` 阶段标记应为：

- `phase_complete_verifiable`

不应标记为：

- `repo_gate_green`

原因：

- `hub-lite` 相关能力线已经通过 L1/L2/L3
- 仓库默认测试入口仍受独立的 `test:core` 既有失败阻塞

## 建议测试时机

1. 修改 heuristic 时：
- 只跑 `node --test ./test/hub-lite-artifacts.test.mjs`

2. 完成一整类能力收口时：
- 跑 `npm run build:api`
- 跑 `npm run test:api`

3. 准备提 PR / 停手 / 交付时：
- 跑 `npm run test`

4. 准备跑最终质量门禁时：
- 先解决 `test:core` 既有失败
- 再跑 `npm run quality-gate`
