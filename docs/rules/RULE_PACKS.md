# 规则包组织方式

## 目录约定

- `rules/languages/<lang>/`：通用语言规则
- `rules/projects/<project>/`：项目特化规则

每个目录可以包含多个 YAML 文件。

## 装载入口

### CLI

- `--project <name>`：通过 adapter 注入默认 `ruleGlobs`
- `--rules <glob...>`：追加显式 YAML glob

CLI 当前不是通过 `packName` 字符串协议选包，而是通过 adapter 默认规则和显式 glob 组合来装载。

### API

- `/scan` 支持内置 `rulePack`
- 当前内置别名只有：
  - `lsclaw-governance`

其实际展开路径见：

- `packages/api/src/routes/core/scan.ts`

## 装载顺序

默认顺序：

```text
rules/languages/**/* -> rules/projects/<project>/**/* -> explicit globs
```

## 追溯说明

规则来源追溯、`ruleFile` 注入、`governanceDomain/impactHint` 传播与 native artifact 特殊行为，见：

- `docs/rules/RULE_TRACEABILITY.md`
