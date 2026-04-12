# Structure Map 使用说明

**文档版本**: 1.0  
**适用范围**: `hub-lite:artifacts` 产出的 `structure-map.json`

---

## 概述

`structure-map.json` 是 `hub-lite:artifacts` 导出命令的产物之一，提供代码库的结构化证据，包括文件拓扑、符号表、依赖关系、路由声明与绑定等。

---

## 能力边界

### 适合的场景 ✅

| 场景 | 说明 |
|------|------|
| **结构盘点** | 了解代码库的文件组织、模块依赖、符号分布 |
| **热点排序** | 按复杂度、引用数、变更频率排序文件/函数 |
| **边界证据** | Fastify 字面量注册链的路由绑定证据 |

### 不适合的场景 ❌

| 场景 | 说明 | 替代方案 |
|------|------|----------|
| **完整 route truth** | 不支持变量前缀、模板路径、多框架 | OpenAPI + 集成测试 + 外部运行时探针 |
| **运行时行为验证** | 静态分析无法覆盖动态路由注册 | 运行时探针 (`route_runtime`) |
| **跨框架路由分析** | 当前仅支持 Fastify | 等待 Framework Adapter 扩展 |

---

## 四层路由证据

`structure-map.json` 提供四层路由证据，从静态到运行时：

### 1. route_declares - 本地声明层

代码中声明的路由 handler，如：

```typescript
// 会被识别为 route_declare
fastify.get('/users', async (request, reply) => { ... })
```

### 2. route_mounts - 注册挂载层

路由注册点的挂载信息，如：

```typescript
// 会被识别为 route_mount
await fastify.register(userRoutes, { prefix: '/users' })
```

### 3. route_binds - 组合绑定层

组合 declares 和 mounts 后的 `runtime_like` 绑定：

```json
{
  "method": "GET",
  "path": "/users",
  "evidence": {
    "level": "static_combined",
    "tier": "core",
    "activation": { "mode": "enabled" },
    "mountDepth": 1
  }
}
```

**重要**: `route_binds` 当前提供的是 **minimal Fastify literal-only runtime-like bind evidence**，不是 full route truth。

### 4. route_runtime - 运行时探针

通过受控启动 `packages/api/dist` 获取的真实运行时路由列表。

### 5. route_runtime_deltas - 差异归因

对比 `route_binds` 和 `route_runtime` 的差异：

```json
{
  "method": "HEAD",
  "path": "/users",
  "relation": "auto_head",
  "reasons": ["Fastify auto-generated HEAD route"],
  "matchedBind": { "method": "GET", "path": "/users" }
}
```

支持的差异类型：

| 类型 | 说明 |
|------|------|
| `exact_match` | 完全匹配 |
| `auto_head` | Fastify 自动生成的 HEAD 路由 |
| `trailing_slash_variant` | 尾部斜杠变体 |

---

## 控制流 Guard 提取

`route_binds` 支持从以下控制流模式提取激活条件：

### 支持的模式 ✅

```typescript
// 1. 直接 early-return guard
if (!ROUTE_CONFIG.enableExperimental) return

// 2. alias guard
const enabled = ROUTE_CONFIG.enableExperimental
if (enabled) { await register(...) }

// 3. else / else if 分支
if (condA) { registerA() } else { registerB() }

// 4. 简单布尔组合
if (flagA && flagB) { register() }
if (!flagA || !flagB) return

// 5. helper gate (同文件、单一 return)
const shouldEnable = (flag) => { return flag }
if (shouldEnable(ROUTE_CONFIG.x)) { register() }
```

### 提取结果

```json
{
  "activation": {
    "mode": "flag_set",
    "requiredFlags": ["ROUTE_CONFIG.enableExperimental"],
    "guardShape": "compound_and",
    "additionalConditions": ["ROUTE_CONFIG.enableV2"]
  }
}
```

---

## 下游使用建议

### lsclaw 适配

`lsclaw` 如需稳定消费 `structure-map.json`，请以 [docs/adapters/lsclaw-artifact-contract.md](../adapters/lsclaw-artifact-contract.md) 为准。

关键字段保证：
- `structureFiles`: 文件路径、语言、大小
- `structureSymbols`: 符号名、类型、位置
- `route_declares`: 方法、路径、来源文件
- `route_binds`: 方法、路径、激活条件（Fastify literal-only）

### 自定义消费

如需自定义消费 `structure-map.json`，建议：

1. **版本锁定**: 关注 `structure-map.json` 的 schema 版本
2. **防御性编程**: 不存在的字段应视为可选
3. **组合验证**: 路由证据应结合 OpenAPI/集成测试交叉验证

---

## 更新记录

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-04-12 | 1.0 | 初始版本，整理四层路由证据说明 |

---

## 参考

- [README.md](../../README.md) 稳定面与预览面章节
- [docs/ACTIVE_TODO.md](../ACTIVE_TODO.md) route_binds 补源计划
- [docs/hub-lite-route-evidence-acceptance.md](../hub-lite-route-evidence-acceptance.md) 阶段验收说明
