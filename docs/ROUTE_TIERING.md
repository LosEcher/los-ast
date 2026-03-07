# los-ast 路由分层策略

| 元数据 | 值 |
|--------|-----|
| **版本** | 1.0.0 |
| **状态** | 已实施 |
| **更新日期** | 2026-03-07 |

---

## 1. 设计目标

1. **稳定性保证**: Core 层 API 提供向后兼容保证
2. **快速迭代**: Experimental 层允许快速验证新功能
3. **安全隔离**: Internal 层限制访问，防止生产环境暴露
4. **清晰边界**: 明确标记各端点的归属和迁移计划

---

## 2. 三层架构详解

### 2.1 Core 层

```
┌─────────────────────────────────────────┐
│  Core Layer - 核心能力层                 │
│  始终启用，提供稳定的代码分析能力          │
├─────────────────────────────────────────┤
│  /healthz/live     - 存活检查            │
│  /healthz/ready    - 就绪检查            │
│  /scan             - 代码扫描            │
│  /discover/symbols - 符号发现            │
└─────────────────────────────────────────┘
```

**设计原则：**
- 硬约束 #1 (P0 Scope Freeze) 仅适用于 Core 层
- API 契约冻结，保证向后兼容
- 所有外部项目应仅依赖 Core 层

### 2.2 Experimental 层

```
┌─────────────────────────────────────────┐
│  Experimental Layer - 实验性功能层        │
│  默认关闭，用于验证 Phase 1.x 功能         │
├─────────────────────────────────────────┤
│  /experimental/memory-proposals         │
│  /experimental/incidents                │
│  /experimental/attribution              │
│  /experimental/recovery                 │
│  /experimental/approvals                │
│  /experimental/hotreload                │
│  /experimental/evidence                 │
└─────────────────────────────────────────┘
```

**设计原则：**
- 显式前缀 `/experimental` 提醒使用者
- 默认关闭，需环境变量启用
- API 可能变更，不保证兼容
- 每个路由标记迁移计划

### 2.3 Internal 层

```
┌─────────────────────────────────────────┐
│  Internal Layer - 内部管理层             │
│  默认关闭，用于开发/调试/监控              │
├─────────────────────────────────────────┤
│  (预留，未来添加调试端点、指标接口等)       │
└─────────────────────────────────────────┘
```

**设计原则：**
- 显式前缀 `/internal`
- 仅建议在开发环境启用
- 生产环境启用时需配合访问控制

---

## 3. 配置参考

### 3.1 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ENABLE_EXPERIMENTAL_ROUTES` | `false` | 启用实验性路由 |
| `ENABLE_INTERNAL_ROUTES` | `false` | 启用内部路由 |

### 3.2 路由前缀

| 层级 | 前缀 | 配置键 |
|------|------|--------|
| Core | `/` | `ROUTE_CONFIG.prefixes.core` |
| Experimental | `/experimental` | `ROUTE_CONFIG.prefixes.experimental` |
| Internal | `/internal` | `ROUTE_CONFIG.prefixes.internal` |

---

## 4. 迁移计划表

| 路由 | 当前位置 | 目标位置 | 计划时间 | 状态 |
|------|----------|----------|----------|------|
| `/experimental/memory-proposals` | los-ast | los-memory | Milestone B | planned |
| `/experimental/incidents` | los-ast | VPS Agent Web | Milestone B+ | planned |
| `/experimental/attribution` | los-ast | VPS Agent Web | Milestone B+ | planned |
| `/experimental/recovery` | los-ast | VPS Agent Web | Milestone B+ | planned |
| `/experimental/approvals` | los-ast | VPS Agent Web | Milestone B+ | planned |
| `/experimental/hotreload` | los-ast | los-ast | - | keep |
| `/experimental/evidence` | los-ast | los-ast | - | keep |

---

## 5. 决策原则

### 5.1 路由分层决策树

```
新功能应该放在哪一层？

1. 是否是 P0 核心功能？
   ├── 是 -> Core 层
   └── 否 -> 继续判断

2. 是否涉及跨项目边界？
   ├── 是 -> Experimental 层，标记迁移计划
   └── 否 -> 继续判断

3. 是否是开发/调试/管理功能？
   ├── 是 -> Internal 层
   └── 否 -> Experimental 层
```

### 5.2 升级路径

**Experimental -> Core 升级条件：**
1. API 契约稳定运行至少 2 个版本
2. 有完整的测试覆盖
3. 通过架构评审
4. 文档完善

**迁移至其他项目：**
1. 目标项目准备就绪
2. 接口契约对齐
3. 发布迁移公告
4. 保留兼容层至少 1 个版本

---

## 6. 最佳实践

### 6.1 客户端使用建议

**生产环境客户端：**
- 仅使用 Core 层端点
- 避免依赖 Experimental 层
- 关注迁移公告

**开发环境客户端：**
- 可启用 Experimental 层进行测试
- 及时反馈 API 设计问题
- 准备迁移到稳定端点

### 6.2 服务端部署建议

**生产环境：**
```bash
# .env.production
ENABLE_EXPERIMENTAL_ROUTES=false
ENABLE_INTERNAL_ROUTES=false
REQUIRE_FULL_SCOPE=true
```

**开发环境：**
```bash
# .env.development
ENABLE_EXPERIMENTAL_ROUTES=true
ENABLE_INTERNAL_ROUTES=true
REQUIRE_FULL_SCOPE=false
```

---

## 7. 相关文档

- [API 使用指南](../API_USAGE.md) - 包含路由层级和稳定性说明
- [架构边界说明书](./architecture-boundary-spec.md) - 四项目边界定义
- [验收检查报告](./ACCEPTANCE_REPORT.md) - 验收状态
- [实现路线图](./implementation-roadmap-v1.1.md) - Milestone 规划
