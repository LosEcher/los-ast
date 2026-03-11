# lsclaw 治理规则集元信息模板

## 目录约定

- `rules/projects/lsclaw-governance/`：面向 lsclaw/VPS Agent Web 的治理规则
- `rules/projects/<project>/`：按项目适配的专项规则

## 建议命名与分层

- `*.frontend-*.yml`：前端治理（网络层、UI 入参、状态边界）
- `*.backend-*.yml`：后端治理（路由、异常处理、鉴权）
- `*.database-*.yml`：数据库治理（查询安全、字段读写边界）
- `*.contract-*.yml`：接口契约治理（下阶段接 OpenAPI/Schema）

每条规则建议携带 `governance` 块：

```yaml
governance:
  domain: frontend | backend | database | interface
  owner: <team>
  impact: high | medium | low
  rationale: <why rule exists>
```

## 建议同时提供规则集级说明文件

建议在规则目录下增加一个不参与扫描加载的说明文件，例如：

```text
rules/projects/lsclaw-governance/RULESET.md
```

推荐字段：

- `Version`
- `Status`
- `Last Updated`
- `Owner`
- `Purpose`
- `Files`
- `Load Path`
- `Evolution`
