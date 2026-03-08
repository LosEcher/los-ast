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

## 文档

- 架构说明：[architecture.md](docs/architecture.md)
- 生态调研：[tooling-landscape.md](docs/research/tooling-landscape.md)
- AI 使用手册：[AI_USAGE_GUIDE.md](docs/ai/AI_USAGE_GUIDE.md)
- API 使用示例：[API_USAGE.md](API_USAGE.md)
- VPS Agent Web 集成：[vps-agent-web-integration.md](docs/api/vps-agent-web-integration.md)
- VPS Agent Web 对接清单：[vps-agent-web-contract-checklist.md](docs/api/vps-agent-web-contract-checklist.md)
- VPS Agent Web 请求示例与错误映射：[vps-agent-web-examples-errors.md](docs/api/vps-agent-web-examples-errors.md)
- 输出格式（JSONL）：[OUTPUT_SCHEMA.md](docs/ai/OUTPUT_SCHEMA.md)
- 规则编写规范：[RULE_AUTHORING.md](docs/rules/RULE_AUTHORING.md)
- 项目适配器：
  - [cantool.md](docs/adapters/cantool.md)
  - [lsclaw.md](docs/adapters/lsclaw.md)
  - [fullstackframe.md](docs/adapters/fullstackframe.md)

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
