# lsclaw 适配器

## 目标仓库

- 默认路径：`/Users/echerlos/Downloads/projects/lsclaw`

## 语言范围

- JavaScript/TypeScript（control-plane）
- JSON（config）

## 默认忽略

- `**/node_modules/**`
- `**/dist/**`
- `**/.git/**`

## 默认规则包

- `lsclaw:default`

## 推荐接入方式

`lsclaw` 当前应优先把 `los-ast` 作为稳定扫描内核接入，而不是把 preview 控制面路由当作主入口。

稳定入口：

- `GET /healthz/live`
- `GET /healthz/ready`
- `POST /scan`
- `POST /discover/symbols`

稳定 artifact 消费面：

- `scan-findings.jsonl`
- `symbols.json`
- `structure-map.json`

artifact 契约说明：

- `docs/adapters/lsclaw-artifact-contract.md`

推荐分工：

- 代码治理：直接走 `rules + include/ignore`
- 接口治理：把 OpenAPI 文本送入 `openApiDocuments`
- 字段治理：把 SQL / Prisma 文本送入 `schemaDocuments`

## `/scan` 集成建议

### 代码扫描

```json
{
  "project": "lsclaw",
  "rootDir": "/workspace/lsclaw",
  "rulePack": "lsclaw-governance"
}
```

### 接口治理输入

```json
{
  "project": "lsclaw",
  "rootDir": "/workspace/lsclaw",
  "openApiDocuments": [
    {
      "source": "gateway-openapi",
      "file": "openapi.yaml",
      "content": "openapi: 3.0.3\npaths: ...",
      "format": "yaml"
    }
  ]
}
```

### 字段治理输入

```json
{
  "project": "lsclaw",
  "rootDir": "/workspace/lsclaw",
  "schemaDocuments": [
    {
      "source": "db-schema",
      "file": "schema.prisma",
      "content": "model User { ... }",
      "format": "prisma"
    }
  ]
}
```

## 运行时开关

可按灰度需要控制原生 parser：

- `ENABLE_OPENAPI_NATIVE_PARSER=true|false`
- `ENABLE_SCHEMA_NATIVE_PARSER=true|false`

说明：

- 关闭 native parser 后，`contractArtifacts` / `schemaArtifacts` 直通模式仍可继续使用。
- 新接入优先用 native input；兼容链路或外部提取器仍可继续走 artifact passthrough。

## 降级与重试

- 遇到 `503 SERVICE_UNAVAILABLE + CORE_NOT_READY` 时，不要静默切到其他分析路径。
- 先调用 `GET /healthz/ready`，就绪后再重试。
- 详见：`docs/service-readiness-degradation-contract.md`

## 当前验证状态

2026-03-11 已完成一轮针对性自测，覆盖：

- config validation
- scan-service native input
- artifact parser registry / profiles
- `/scan` integration
- `/scan` contract
- parser golden baseline

结果：

- `7` 个测试文件
- `70` 个测试全部通过

## `hub-lite:artifacts` 契约

`lsclaw` 如需消费 `hub-lite:artifacts`，当前应只依赖稳定消费面，不应把 `structure-map.json` 当作完整 route truth。

推荐命令：

```bash
npm run hub-lite:artifacts -- --root <workspace> --project lsclaw --include 'src/**/*.ts' --deterministic
```

说明：

- 成功执行后应同时得到 `scan-findings.jsonl`、`symbols.json`、`structure-map.json`
- 默认输出目录为 `<workspace>/logs/hub-lite-artifacts`
- `structure-map.json` 当前是“结构证据 + 最小 Fastify route 分层输出”，不是 route truth 真源
- `test:lsclaw:adapter:artifacts`、`test:lsclaw:adapter:runtime`、`test:lsclaw:adapter` 当前作为稳定 smoke 入口保留
- 详见 `docs/adapters/lsclaw-artifact-contract.md`
