# 规则来源追溯与装载链路

本说明用于回答三个问题：

1. 规则包元信息写在哪里。
2. 规则在 CLI / API 中是如何被装载的。
3. 扫描结果中的 `ruleFile`、`ruleId`、`governanceDomain`、`impactHint` 应该如何回溯到规则来源。

## 1. 元信息落点

规则来源可追溯信息分两层维护：

### 规则集级

以 `rules/projects/lsclaw-governance/` 为例：

- `rules/projects/lsclaw-governance/RULESET.md`
  - `Version`
  - `Status`
  - `Last Updated`
  - `Owner`
  - `Load Path`
  - fixture / threshold 基线

这层用于回答“这是一组什么规则、当前版本是什么、由谁维护、应通过什么入口加载”。

### 单条规则级

每条 YAML 规则负责声明：

- `id`
- `severity`
- `message`
- `governance.domain`
- `governance.owner`
- `governance.impact`
- `governance.rationale`

这层用于回答“某一条 finding 是哪条规则命中的、属于哪个治理域、风险提示是什么”。

## 2. 装载链路

### CLI

CLI 不直接支持“传一个 packName 字符串就自动展开”的独立协议。当前有两种入口：

1. `--project <name>`
- 由 adapter 决定默认 `ruleGlobs`
- 入口实现：`packages/cli/src/index.mjs`

2. `--rules <glob...>`
- 追加显式 rule globs
- 仍然由 `loadRuleFiles(...)` 统一解析

CLI 的默认顺序是：

```text
language base -> project extension -> explicit globs
```

### API

API 的 `/scan` 额外支持内置 `rulePack` 别名。

当前内置别名：

```text
lsclaw-governance -> rules/projects/lsclaw-governance/**/*.yml
```

入口实现：

- `packages/api/src/routes/core/scan.ts`

API 的 `rulePack` 最终仍会被展开为 glob，再交给 core 的 `loadRuleFiles(...)`。

## 3. Core 落地位置

### 规则装载

`packages/core/src/rules.mjs`

装载阶段会做这些事情：

1. 用 `fast-glob` 把传入的 glob 展开成绝对路径。
2. 解析 YAML。
3. 规范化 `severity`、`constraints`、`governance`。
4. 把规则文件绝对路径写入 `rule.ruleFile`。

因此：

- finding 中的 `ruleFile` 来自实际被加载的 YAML 绝对路径。
- `governanceDomain` / `impactHint` 的原始来源是规则 YAML 中的 `governance` 块。

### finding 输出

`packages/core/src/runner.mjs`

扫描命中时，runner 会把下列字段复制到 finding：

- `ruleFile`
- `ruleId`
- `findingSource`
- `governanceDomain`
- `impactHint`

这意味着消费方拿到一个 finding 后，可以直接沿下面路径追溯：

```text
finding.ruleFile -> YAML rule file
finding.ruleId -> YAML id
finding.governanceDomain / impactHint -> YAML governance.domain / governance.impact
```

## 4. Native Artifact 输入的特殊点

对于 `openApiDocuments` / `schemaDocuments` 这类 native artifact 输入，部分 finding 不是来自 YAML AST 规则，而是来自 parser 产物。

此时：

- `findingSource` = `contract` 或 `schema`
- `ruleId` = parser 生成的规则语义 ID
- `ruleFile` = 输入的 `source`（或默认 source 标签），不是 YAML 绝对路径

对应实现：

- `packages/api/src/services/scan-service.ts`

所以消费端要区分两类追溯：

1. `findingSource=ast`
- `ruleFile` 追到真实 YAML 文件

2. `findingSource=contract|schema`
- `ruleFile` 追到输入源标签或上游 source，不应误解为本地 YAML 路径

## 5. 发布与变更建议

当规则包发生变更时，至少同步以下位置：

1. `rules/projects/<pack>/RULESET.md`
- 更新 `Version`
- 更新 `Last Updated`
- 更新 coverage / baseline 说明

2. `fixtures/golden/...`
- 若规则语义发生变化，更新整包 fixture 与期望输出

3. `test/rules.test.mjs`
- 更新整包 threshold 断言，避免“规则变了但文档没变”

4. 交付文档
- 需要阶段性留痕时，补充到 `docs/governance/stage*.md`

## 6. 消费建议

对下游系统，推荐最少消费这些字段：

- `ruleId`
- `ruleFile`
- `findingSource`
- `governanceDomain`
- `impactHint`
- `fingerprint`

推荐用途：

- `ruleId`：稳定聚合键
- `ruleFile`：规则来源定位
- `findingSource`：区分 AST / contract / schema 通道
- `governanceDomain`：治理域看板聚合
- `impactHint`：轻量风险分层
- `fingerprint`：去重、回放、抑制
