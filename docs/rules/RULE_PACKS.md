# 规则包组织方式

## 目录约定

- `rules/languages/<lang>/`：通用语言规则
- `rules/projects/<project>/`：项目特化规则

每个目录可以包含多个 YAML 文件。CLI 支持按 `--rules packName` 选择一组规则包。

## packName 约定

- `cantool:default`
- `lsclaw:default`
- `fullstackframe:default`
- `lang:typescript`
- `lang:rust`
