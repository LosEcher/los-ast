# los-ast 配置指南

## 推荐方式：Root 模式（无需配置）

最简单的方式是直接指定代码目录和规则：

```bash
los-ast scan --root /path/to/project --include "src/**/*.ts" --format jsonl
```

## 项目适配器（可选）

对于团队常用项目，可以创建适配器简化命令：

### 配置文件格式

创建 `los-ast.config.json`：

```json
{
  "projects": {
    "myproject": {
      "rootDir": "/path/to/project",
      "include": ["src/**/*.ts", "lib/**/*.ts"],
      "ignore": ["node_modules/**", "dist/**"],
      "ruleGlobs": ["rules/languages/typescript/**/*.yml"]
    }
  }
}
```

### 环境变量方式

```bash
export LOS_AST_PROJECT_MYPROJECT_ROOT=/path/to/project
los-ast scan --project myproject
```

## API 服务配置基线

`packages/api/.env.example` 提供了 API 服务的最小环境变量示例，建议作为本地启动和灰度部署的基线。

关键项：

- `PORT`
- `MAX_FILES_PER_SYNC_SCAN`
- `MAX_RESPONSE_BYTES`
- `MAX_SCAN_DURATION_MS`
- `ENFORCE_JWT`
- `JWT_SECRET` / `LSCLAW_JWT_SECRET`
- `DEV_ALLOW_UNVERIFIED_IDENTITY`
- `ENABLE_EXPERIMENTAL_ROUTES`
- `ENABLE_INTERNAL_ROUTES`
- `ENABLE_VPS_AGENT_WEB_ROUTES`

说明：

- 稳定面默认只需要 `healthz`、`scan`、`discover/symbols`。
- `experimental`、`internal`、`vps-agent-web` 均应按显式开关启用。
- 生产环境不应开启 `DEV_ALLOW_UNVERIFIED_IDENTITY=true`。
- `internal routes` 需要同时配置 IP 白名单或 token。

## 规则包组合策略

规则按以下顺序解析（后加载的覆盖先加载的）：

1. **语言基础包**：`rules/languages/{lang}/**/*.yml`
2. **项目扩展包**：`rules/projects/{name}/**/*.yml`
3. **显式附加包**：`--rules` 指定的额外规则

### 示例：组合规则

```bash
# 使用 TypeScript 基础规则 + 项目特定规则
los-ast scan \
  --root ./src \
  --rules "rules/languages/typescript/**/*.yml,rules/projects/myapp/**/*.yml" \
  --include "src/**/*.ts"
```

## 配置优先级

1. 命令行参数（最高）
2. 环境变量
3. 配置文件
4. 内置默认值（最低）
