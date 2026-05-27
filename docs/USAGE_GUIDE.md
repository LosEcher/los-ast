# los-ast 使用指南

**版本**: 1.0  
**更新日期**: 2026-04-12  
**目标读者**: 首次接入 los-ast 的开发者

---

## 5 分钟快速入门

### 你能用 los-ast 做什么

| 场景 | 命令示例 | 状态 |
|------|----------|------|
| 扫描代码问题 | `npm run los-ast -- scan --root /path --include "src/**/*.ts"` | ✅ 稳定 |
| 发现代码符号 | `POST /discover/symbols` (API) 或 `symbols.json` (artifact) | ✅ 稳定 |
| 生成改写 diff | `npm run los-ast -- fix --root /path --dry-run` | ✅ 稳定 |
| 执行真实改写 | `npm run los-ast -- fix --root /path --apply` | ✅ 稳定 |
| 调用图提取 | `npm run los-ast -- scan --root /path --experimental-extractors` | 🚧 Beta |
| 导出 artifacts | `npm run hub-lite:artifacts -- --root /path --output-dir ./out` | ✅ 稳定 |
| 接口契约比较 | `POST /scan` 传入 `openApiComparisons` | 🚧 进行中 |
| 字段治理 | `POST /scan` 传入 `schemaComparisons` | 🚧 进行中 |
| 路由证据提取 | `npm run hub-lite:artifacts` | 🚧 进行中 |

### 你不能用 los-ast 做什么（当前阶段）

- ❌ 作为完整的接口治理平台（仅支持基础 OpenAPI/Schema 比较）
- ❌ 作为数据库字段治理开箱方案（需要定制规则）
- ❌ 依赖 preview 路由的持久化状态（incident/approval/recovery 将迁出）
- ❌ 将 `structure-map.route_binds` 作为 route truth 唯一来源（仅支持 Fastify literal-only）

---

## 接入方式选择

### 方式 1: CLI 快速扫描（推荐）

适合一次性分析、CI 流水线、本地开发。

```bash
# 基本扫描
npm run los-ast -- scan --root /path/to/project --include "src/**/*.ts" --format jsonl

# 使用项目适配器（预配置）
export LOS_AST_PROJECT_CANTOOL_ROOT=/path/to/cantool
npm run los-ast -- scan --project cantool --format jsonl

# 生成改写 diff（不落盘）
npm run los-ast -- fix --project cantool --dry-run --max-changes 20
```

### 方式 2: API 服务集成

适合长期运行的服务、需要取消支持的大扫描。

```bash
# 启动 API
npm run build:api
cd packages/api && node dist/server.js

# 调用 API
curl -X POST http://localhost:3000/scan \
  -H "Content-Type: application/json" \
  -d '{
    "rootDir": "/path/to/project",
    "include": ["src/**/*.ts"],
    "rulePacks": ["typescript-eslint-recommended"]
  }'
```

### 方式 3: Artifact 消费（下游系统）

适合 `lsclaw` 等需要结构化产出的下游系统。

```bash
# 生成 artifacts
npm run hub-lite:artifacts -- --root /path/to/project --output-dir ./output

# 产物清单
# - scan-findings.jsonl: 扫描发现
# - symbols.json: 符号表
# - structure-map.json: 结构证据（route_declares/mounts/binds/runtime）
```

---

## 稳定面与预览面

### 稳定面（可生产使用）

| 组件 | 说明 |
|------|------|
| `packages/core` | AST 扫描内核 |
| `packages/cli` | 命令行接口 |
| `GET /healthz/live` | 存活检查 |
| `GET /healthz/ready` | 就绪检查 |
| `POST /scan` | 主扫描 API |
| `POST /discover/symbols` | 符号发现 API |

### 预览面（实验性，可能变更）

| 组件 | 迁移计划 |
|------|----------|
| `/experimental/memory-proposals` | 计划迁出至 los-memory |
| `/experimental/incidents` | 计划迁出至 VPS Agent Web |
| `/experimental/attribution` | 计划迁出至 VPS Agent Web |
| `/experimental/recovery` | 计划迁出至 VPS Agent Web |
| `/experimental/approvals` | 计划迁出至 VPS Agent Web |
| `/experimental/hotreload` | 保留（开发辅助） |
| `/experimental/evidence` | 保留（核心能力） |

---

## 下一步做什么

### 如果你是使用者

1. **阅读 [API_USAGE.md](/API_USAGE.md)**: 了解 API 详细用法
2. **阅读 [API_CONTRACT.md](docs/api/API_CONTRACT.md)**: 了解契约细节
3. **运行 `npm run los-ast -- doctor`**: 检查环境配置

### 如果你是规则开发者

1. **阅读 [RULE_AUTHORING.md](docs/rules/RULE_AUTHORING.md)**: 规则编写指南
2. **阅读 [RULE_TRACEABILITY.md](docs/rules/RULE_TRACEABILITY.md)**: 规则溯源说明
3. **查看 `rules/languages/`**: 参考现有规则

### 如果你是下游系统开发者

1. **阅读 [lsclaw-artifact-contract.md](docs/adapters/lsclaw-artifact-contract.md)**: Artifact 契约说明
2. **运行 `npm run test:lsclaw:adapter`**: 验证适配器兼容

---

## 常见问题

### Q: `structure-map.json` 能做什么？

A: 当前适合三类用途：
- ✅ 结构盘点：文件、符号、依赖分析
- ✅ 热点排序：按复杂度/引用数排序
- ⚠️ 路由绑定证据：Fastify 字面量注册链（非完整 route truth）

### Q: 为什么 preview 路由默认关闭？

A: 这些路由属于平台控制面职责，将迁移到专门服务。默认关闭避免误用。

### Q: 如何启用 preview 路由？

A: 设置环境变量 `ENABLE_EXPERIMENTAL_ROUTES=true`，但注意 API 可能变更。

### Q: 发现 bug 或需要新功能？

A: 查看 [ACTIVE_TODO.md](ACTIVE_TODO.md) 了解当前优先级，或提交 issue。

---

## 参考文档

- [README.md](/README.md): 项目概述
- [docs/ACTIVE_TODO.md](docs/ACTIVE_TODO.md): 执行清单（当前有效）
- [docs/architecture.md](docs/architecture.md): 架构说明
- [docs/analysis/PROJECT_MULTI_ROLE_ANALYSIS.md](docs/analysis/PROJECT_MULTI_ROLE_ANALYSIS.md): 多角色分析报告
