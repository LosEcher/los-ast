# los-ast 代码审查报告

**审查日期**: 2026-03-07
**审查范围**: packages/api, packages/shared, packages/core
**审查维度**: 合理性、可维护性、可扩展性

---

## 1. 执行摘要

### 整体评估

| 维度 | 评分 | 说明 |
|------|------|------|
| **合理性** | 8/10 | 架构设计合理，但存在超范围实现 |
| **可维护性** | 7/10 | 有重复代码模式，需要提取公共函数 |
| **可扩展性** | 8/10 | Fastify 插件架构良好，但路由过多 |

### 主要发现

✅ **优点**:
- Fastify 插件架构使用正确
- 统一错误处理机制
- Core/API 边界清晰
- TypeScript 类型覆盖良好

⚠️ **需要改进**:
- 20 处 404 错误处理代码重复
- 路由文件数量超出 Milestone A 范围
- Cancellation 插件有代码重复

---

## 2. 详细审查

### 2.1 代码重复

#### 404 错误处理模式 (20 处)

**位置**: 7 个路由文件

**当前代码**:
```typescript
reply.status(404);
return { error: { message: 'XXX not found' } };
```

**建议**: 提取通用帮助函数
```typescript
// utils/response-helpers.ts
export function notFound(reply: FastifyReply, resource: string) {
  reply.status(404);
  return { error: { message: `${resource} not found` } };
}
```

#### Cancellation 插件重复逻辑

**位置**: `plugins/cancellation.ts`

**重复内容**:
- Client disconnect 检测逻辑（出现 2 次）
- Server timeout 设置逻辑（出现 2 次）
- 日志记录模式（出现 2 次）

**建议**: 提取内部函数
```typescript
function createCancellationManager(request: FastifyRequest, reply: FastifyReply, timeoutMs: number) {
  const abortController = new AbortController();
  let isCancelled = false;

  const onClose = () => { /* ... */ };
  const timeoutId = setTimeout(() => { /* ... */ }, timeoutMs);

  return {
    signal: abortController.signal,
    cleanup: () => { clearTimeout(timeoutId); reply.raw.off('close', onClose); }
  };
}
```

---

### 2.2 路由数量问题

**当前状态**:
```typescript
// server.ts 注册的路由
/scan           ✅ Milestone A
/discover       ✅ Milestone A
/incidents      ⚠️ Phase 1.x (超范围)
/memory         ⚠️ Phase 1.x (超范围)
/attribution    ⚠️ Phase 1.x (超范围)
/recovery       ⚠️ Phase 1.x (超范围)
/approvals      ⚠️ Phase 1.x (超范围)
/hotreload      ⚠️ Phase 1.x (超范围)
/evidence       ⚠️ Phase 1.x (超范围)
```

**建议方案**:

**方案 1: 实验性路由命名空间** (推荐)
```typescript
// 将超范围路由移动到 /experimental 命名空间
await server.register(experimentalRoutes, { prefix: '/experimental' });

// 访问路径变为:
// /experimental/incidents
// /experimental/memory
// ...
```

**方案 2: 功能开关**
```typescript
// 通过环境变量控制
if (process.env.ENABLE_EXPERIMENTAL_ROUTES === 'true') {
  await server.register(experimentalRoutes);
}
```

---

### 2.3 可扩展性评估

#### 插件系统 ✅

**优点**:
- 正确使用了 Fastify 插件系统
- 插件有明确的加载顺序注释
- 使用了 `fastify-plugin` 处理插件依赖

**改进建议**:
```typescript
// 可以添加插件配置接口
interface PluginConfig {
  enabled: boolean;
  priority: number;
  options?: Record<string, unknown>;
}

const pluginRegistry: PluginConfig[] = [
  { enabled: true, priority: 1, plugin: requestIdPlugin },
  { enabled: true, priority: 2, plugin: errorHandlerPlugin },
  // ...
];
```

#### 服务层设计 ✅

**优点**:
- 服务类有明确的接口
- 使用依赖注入模式（通过构造函数/选项对象）

**改进建议**:
```typescript
// 可以添加服务容器
class ServiceContainer {
  private services = new Map<string, unknown>();

  register<T>(name: string, service: T) {
    this.services.set(name, service);
  }

  get<T>(name: string): T {
    return this.services.get(name) as T;
  }
}
```

---

### 2.4 配置管理

**当前实现**:
```typescript
// config/index.ts
export const SCAN_LIMITS = { ... };
export const SCOPE_CONFIG = { ... };
```

**改进建议**:

添加配置验证:
```typescript
import { z } from 'zod';

const ScanLimitsSchema = z.object({
  maxFilesPerSyncScan: z.number().min(1).max(10000),
  maxResponseBytes: z.number().min(1024),
  maxDurationMs: z.number().min(1000),
});

// 在启动时验证
const validatedConfig = ScanLimitsSchema.parse(SCAN_LIMITS);
```

---

### 2.5 测试覆盖

| 类型 | 数量 | 状态 |
|------|------|------|
| 单元测试 | 13 | ✅ 通过 |
| Golden Case | 7 | ✅ 通过 |
| 集成测试 | 17 | ✅ 通过 |

**建议**:
- 添加边界行为专项测试（408, 413）
- 添加性能基准测试

---

## 3. 优化建议

### 高优先级

1. **提取 404 帮助函数**
   ```typescript
   // utils/http-helpers.ts
   export const HttpHelpers = {
     notFound: (reply: FastifyReply, resource: string) => { ... },
     created: (reply: FastifyReply, data: unknown) => { ... },
     // ...
   };
   ```

2. **简化 Cancellation 插件**
   - 提取重复的 cancel 逻辑
   - 合并重复的日志模式

3. **路由分组**
   - 将超范围路由分组到 /experimental
   - 或添加功能开关

### 中优先级

4. **添加配置验证**
   - 使用 Zod 或 Joi 验证配置
   - 启动时检查必填环境变量

5. **统一错误消息**
   - 创建错误消息常量文件
   - 支持 i18n

### 低优先级

6. **性能优化**
   - 添加请求缓存
   - 优化文件扫描算法

---

## 4. 具体优化实施

### 优化 1: HTTP 帮助函数

```typescript
// src/utils/http-helpers.ts
import type { FastifyReply } from 'fastify';

export function notFound(reply: FastifyReply, resource: string) {
  reply.status(404);
  return { error: { message: `${resource} not found` } };
}

export function created<T>(reply: FastifyReply, data: T) {
  reply.status(201);
  return { data };
}

export function badRequest(reply: FastifyReply, message: string) {
  reply.status(400);
  return { error: { message } };
}
```

### 优化 2: 路由分组

```typescript
// src/server.ts
import { registerCoreRoutes } from './routes/core/index.js';
import { registerExperimentalRoutes } from './routes/experimental/index.js';

// Core 路由 (Milestone A)
await server.register(registerCoreRoutes);

// 实验性路由 (Phase 1.x)
if (process.env.ENABLE_EXPERIMENTAL_ROUTES === 'true') {
  await server.register(registerExperimentalRoutes, { prefix: '/experimental' });
}
```

### 优化 3: Cancellation 重构

```typescript
// src/utils/cancellation.ts
export interface CancellationManager {
  signal: AbortSignal;
  cleanup: () => void;
}

export function createCancellationManager(
  request: FastifyRequest,
  reply: FastifyReply,
  timeoutMs: number
): CancellationManager {
  // 实现...
}
```

---

## 5. 结论

### 代码质量总结

los-ast 项目的代码整体质量良好，架构设计合理，符合 Milestone A 的要求。主要问题是：

1. **重复代码**: 404 错误处理在 7 个文件中重复了 20 次
2. **范围控制**: 实现了超出 Milestone A 范围的路由
3. **代码组织**: 可以进一步提取公共函数提高可维护性

### 下一步行动

1. ✅ **已完成**: 清理 .DS_Store 文件
2. 🔄 **建议实施**: 提取 HTTP 帮助函数
3. 🔄 **建议实施**: 路由分组/功能开关
4. 📋 **Milestone B 考虑**: 配置验证、性能优化

---

**签名**: Claude Code
**日期**: 2026-03-07
