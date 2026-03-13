# los-ast

los-ast 是一个面向多代码库的通用 AST 扫描与改写工具，用于辅助 AI 在真实工程中进行结构化检索、诊断、自动修复与批量重构。它以“规则包 + 项目适配器”为核心组织方式，默认安全（dry-run）、可复现（JSONL 机读输出）、可验证（fixtures golden tests）。

## 快速开始

### 安装依赖

```bash
npm install
```

### 快速扫描（推荐方式）

**使用 --root 模式（无需配置，默认推荐）**
```bash
npm run los-ast -- scan --root /path/to/your/project --include "src/**/*.ts" --format jsonl
```

### 配置项目适配器（可选）

项目适配器为常用项目提供便捷的预配置，适合团队协作场景：

**方式1: 环境变量**
```bash
export LOS_AST_PROJECT_CANTOOL_ROOT=/path/to/cantool
npm run los-ast -- scan --project cantool --format jsonl
```

**方式2: 配置文件**
创建 `los-ast.config.json`：
```json
{
  "projects": {
    "cantool": {
      "rootDir": "/path/to/cantool",
      "include": ["src/**/*.rs", "frontend/src/**/*.ts"],
      "ruleGlobs": ["rules/projects/cantool/**/*.yml"]
    }
  }
}
```

**使用适配器扫描**
```bash
npm run los-ast -- scan --project cantool --format jsonl
```

### 生成 dry-run diff（不落盘）

```bash
npm run los-ast -- fix --project cantool --dry-run --max-changes 20
```

### 真实改写（需要显式开启）

```bash
npm run los-ast -- fix --project cantool --apply --max-changes 20
```

## 从哪里开始看

如果你是第一次接触这个仓库，建议按这个顺序阅读：

1. [docs/ACTIVE_TODO.md](docs/ACTIVE_TODO.md): 当前有效执行清单，也是“现在能做什么、不能做什么、接下来做什么”的唯一入口。
2. [README 的稳定面与预览面](#稳定面与预览面): 判断哪些能力适合接入，哪些仍是预览域。
3. [docs/architecture.md](docs/architecture.md): 了解 core / cli / adapters / rules 的职责边界。

## 文档入口

按接入与开发场景分组：

- 核心接入：
  - [API_USAGE.md](API_USAGE.md)
  - [docs/API_CONTRACT.md](docs/API_CONTRACT.md)
  - [docs/api/artifact-parser-profiles.md](docs/api/artifact-parser-profiles.md)
  - [docs/ai/OUTPUT_SCHEMA.md](docs/ai/OUTPUT_SCHEMA.md)
- 规则与治理：
  - [docs/rules/RULE_AUTHORING.md](docs/rules/RULE_AUTHORING.md)
  - [docs/rules/RULE_TRACEABILITY.md](docs/rules/RULE_TRACEABILITY.md)
  - [docs/adapters/lsclaw-artifact-contract.md](docs/adapters/lsclaw-artifact-contract.md)
  - [docs/hub-lite-route-evidence-acceptance.md](docs/hub-lite-route-evidence-acceptance.md)
- 项目适配器：
  - [docs/adapters/cantool.md](docs/adapters/cantool.md)
  - [docs/adapters/lsclaw.md](docs/adapters/lsclaw.md)
  - [docs/adapters/fullstackframe.md](docs/adapters/fullstackframe.md)
- 深入资料：
  - [docs/research/tooling-landscape.md](docs/research/tooling-landscape.md)
  - [docs/ai/AI_USAGE_GUIDE.md](docs/ai/AI_USAGE_GUIDE.md)
  - `docs/governance/*`
  - `docs/api/vps-agent-web-*`

## 稳定面与预览面

- 稳定面：
  - `packages/core`
  - `packages/cli`
  - `GET /healthz/live`
  - `GET /healthz/ready`
  - `POST /scan`
  - `POST /discover/symbols`
- 预览面：
  - `packages/api/src/routes/experimental/*`
  - `packages/api/src/routes/vps-agent-web/*`
  - incident / approval / attribution / recovery / memory proposal 相关能力

当前建议把本项目作为“代码治理与证据输出内核”接入；对于接口治理、字段治理、执行编排，不应按已完全产品化能力理解。

新接入方如果只想依赖稳定契约，可以只关注：

- CLI: `los-ast scan|fix|explain|doctor`
- API: `GET /healthz/live`、`GET /healthz/ready`、`POST /scan`、`POST /discover/symbols`
- Artifact contract: `scan-findings.jsonl`、`symbols.json`、`structure-map.json`

补充说明：当前 `hub-lite` 导出的 `structure-map.json` 适合用于“结构盘点 / 热点排序 / 边界证据”，并已支持 Fastify 四层路由证据输出：`route_declares`、`route_mounts`、`route_binds`、`route_runtime`，以及基础差异归因 `route_runtime_deltas`；其中静态层已能从 `if (!ROUTE_CONFIG.enableX) return;`、`const enabled = ROUTE_CONFIG.enableX` 后的 alias guard、`if (enabled) { register(...) }` 这类正向 block gate、`else / else if` 分支 route mount、带外层括号的简单 `&& / ||` 组合门禁，以及同文件单一 `return` helper gate 中提取 `control_flow_guard`，并在需要时保留 `guardShape` 与 `additionalConditions`；运行时层则按 `packages/api/dist` 的默认 flag wiring 做受控探针，不再强制挂载默认关闭路由，并会标出 `exact_match`、`auto_head`、`trailing_slash_variant` 等差异。但它还不适合作为完整“route truth 真源”，多框架、更复杂控制流和真实运行态仍需要结合 OpenAPI、集成测试或外部运行时探针交叉验证。

`lsclaw` 如需稳定消费 `hub-lite:artifacts`，请以 [docs/adapters/lsclaw-artifact-contract.md](/Users/echerlos/Downloads/projects/los-ast/docs/adapters/lsclaw-artifact-contract.md) 为准；独立 smoke 入口见 `npm run test:lsclaw:adapter:artifacts`、`npm run test:lsclaw:adapter:runtime`。

当前阶段验收说明见 [docs/hub-lite-route-evidence-acceptance.md](/Users/echerlos/Downloads/projects/los-ast/docs/hub-lite-route-evidence-acceptance.md)，阶段标记见 [docs/status/hub-lite-route-evidence.phase.json](/Users/echerlos/Downloads/projects/los-ast/docs/status/hub-lite-route-evidence.phase.json)。

## 部署入口

- 开发编排（仓库根目录）：`docker-compose.yml`
- 部署编排（deploy 目录）：`deploy/docker-compose.yml`
- API 镜像构建文件：
  - `packages/api/Dockerfile`
  - `deploy/Dockerfile`

## 目录结构

```
packages/
  core/        执行引擎（扫描、改写、报告、缓存）
  cli/         命令行入口（scan/fix/explain/doctor）
  adapters/    项目适配器（cantool/lsclaw/fullstackframe）
  rules/       内置规则加载与测试支持
  ai/          AI 友好输出与模板（schema/prompt）
rules/         可热加载的 YAML 规则库（语言/项目分组）
fixtures/      golden fixtures（before/after）
reports/       默认输出目录（JSONL/Markdown）
docs/          项目文档
```
