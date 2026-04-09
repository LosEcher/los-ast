# 改动 Review 与下一步分析

**Review 日期**: 2026-04-01  
**质量门禁**: ✅ 全部通过 (417/417 测试)

---

## 一、已完成改动 Review

### 1.1 改动概览

```
新增文件: 4 个测试文件
新增代码: 772 行 (全部测试代码)
测试新增: 57 个测试用例
总测试数: 417 (全部通过)
```

### 1.2 质量评估

| 维度 | 评分 | 说明 |
|-----|------|------|
| **测试完整性** | ⭐⭐⭐⭐⭐ | 覆盖正常/异常/边界情况 |
| **代码规范** | ⭐⭐⭐⭐⭐ | 遵循 vitest + TypeScript 规范 |
| **可读性** | ⭐⭐⭐⭐⭐ | describe/it 结构清晰 |
| **维护性** | ⭐⭐⭐⭐☆ | 使用 fake timers，环境隔离良好 |

### 1.3 测试亮点

#### ID Generator Tests
- ✅ UUID v4 格式验证 (version/variant 位)
- ✅ 唯一性验证 (100 次调用)
- ✅ 时间戳范围验证
- ✅ 未知类型降级处理

#### Cache Tests
- ✅ TTL 过期机制 (fake timers)
- ✅ LRU 淘汰策略
- ✅ 禁用状态处理
- ✅ 装饰器模式测试
- ✅ 路由缓存中间件

#### Error Handler Tests
- ✅ 所有错误类别状态码映射
- ✅ 生产/开发环境差异
- ✅ Fastify 验证错误处理
- ✅ 非 Error 类型抛出 (string/null/undefined)
- ✅ 404 路由处理
- ✅ requestId/timestamp 注入

---

## 二、当前测试覆盖全景

### 2.1 覆盖热力图

```
✅ = 有独立测试    ⚠️ = 通过集成覆盖    ❌ = 无测试

packages/
├── core/src/
│   ├── runner.mjs              ✅
│   ├── rules.mjs               ✅
│   ├── runner/*.mjs            ❌ (6 个文件)
│   ├── report.mjs              ❌
│   ├── parse-cache.mjs         ❌
│   └── languages.mjs           ❌
│
├── cli/src/
│   ├── index.mjs               ⚠️ (integration)
│   ├── export-artifacts.mjs    ✅
│   ├── route-guard-analysis    ✅ + 7 子模块 ⚠️
│   └── source-structure        ✅ + 4 子模块 ⚠️
│
├── api/src/
│   ├── routes/core/*           ✅ 覆盖良好
│   ├── routes/experimental/*   ❌ 预览面无测试
│   ├── services/core/*         ✅ 覆盖良好
│   ├── services/preview/*      ❌ 8 个服务无测试
│   ├── plugins/
│   │   ├── error-handler.ts    ✅ (新增)
│   │   ├── identity.ts         ✅
│   │   ├── scope-validator.ts  ✅
│   │   ├── cancellation.ts     ✅
│   │   ├── request-id.ts       ❌
│   │   ├── health-check.ts     ❌
│   │   └── internal-access.ts  ❌
│   └── utils/*                 ✅ (新增)
```

### 2.2 测试缺口分析

| 类别 | 缺口数量 | 风险等级 | 建议优先级 |
|-----|---------|---------|-----------|
| Core runner 子模块 | 6 | 🟡 中 | P1 |
| Plugins (剩余) | 3 | 🟡 中 | P1 |
| Preview 服务 | 8 | 🟢 低 | P2 (迁出前补基础测试) |
| Core 工具函数 | 3 | 🟡 中 | P1 |

---

## 三、下一步分析

### 3.1 战略决策点

基于当前状态，有两个主要方向：

**方向 A: 继续补测试 (保守)**
- 补齐 Core runner 模块测试
- 补齐剩余 Plugins 测试
- 为 preview 服务增加基础测试

**方向 B: 开始架构演进 (激进)**
- 立即开始 preview 面迁出设计
- 拆分 oversized shared 文件
- 补充测试与架构优化并行

### 3.2 推荐路径: 混合策略

```
Phase 1 (本周): 基础能力闭环
├── 补齐剩余 Plugins 测试 (3 个)
└── 补齐 Core runner 关键模块测试 (3-4 个)

Phase 2 (下周): 架构优化
├── 拆分 openapi-artifacts/shared.ts (>800 行)
├── 设计 preview 迁出 API 契约
└── 建立 shared 层测试基线

Phase 3 (下月): 架构演进
├── 实施 preview 服务迁出
├── 建立服务间通信机制
└── 完善集成测试
```

---

## 四、具体下一步建议

### 4.1 本周执行 (Phase 1)

| 任务 | 工作量 | 价值 |
|-----|-------|------|
| `plugins/request-id.test.ts` | 低 | 基础设施，简单 |
| `plugins/health-check.test.ts` | 低 | 基础设施，简单 |
| `plugins/internal-access.test.ts` | 中 | 安全相关，重要 |
| `core/runner/shared.test.mjs` | 中 | Core 核心逻辑 |
| `core/runner/scan.test.mjs` | 中 | Core 核心逻辑 |

**预期**: +5 个测试文件, ~80 个测试用例, 测试覆盖达到 85%+

### 4.2 下周执行 (Phase 2)

| 任务 | 目标 |
|-----|------|
| 拆分 `openapi-artifacts/shared.ts` | 按 parser/validator/comparator 拆分 |
| 拆分 `config/shared.ts` | 按 domain (scan/auth/route) 拆分 |
| 设计 preview 迁出契约 | 定义 gRPC/HTTP 接口 |

### 4.3 下月执行 (Phase 3)

| 任务 | 目标 |
|-----|------|
| 实现 incident 服务迁出 | 第一个 preview 服务独立 |
| 验证服务间通信 | 确保 los-ast 核心可调用 |
| 更新文档 | 新的部署架构 |

---

## 五、风险与建议

### 5.1 风险点

| 风险 | 概率 | 影响 | 缓解 |
|-----|------|------|------|
| Preview 迁出复杂度被低估 | 中 | 高 | 先做一个最小试点 |
| Core runner 测试难写 | 中 | 中 | 使用 mocking + fixtures |
| 架构优化引入回归 | 低 | 中 | 保持契约测试 |

### 5.2 关键决策

**是否现在就开始迁出 preview 服务？**

建议: **暂缓 2 周**
- 先完成基础测试覆盖 (本周)
- 先完成 oversized shared 拆分 (下周)
- 同时并行设计迁出契约
- 2 周后开始实施迁出

**理由**:
1. 测试覆盖提升到 85% 后再动架构更稳妥
2. shared 层拆分是迁出的前置条件
3. 需要设计时间来避免迁出后的接口混乱

---

## 六、总结

### 已完成 ✅
- P0 测试盲点补齐
- 质量门禁保持通过
- 测试覆盖从 75% 提升到 82%

### 下一步 🎯
1. **本周**: 补齐剩余 plugins + core runner 测试
2. **下周**: 拆分 oversized shared 文件
3. **2 周后**: 开始 preview 服务迁出

### 健康度趋势
```
测试覆盖: 75% → 82% → (目标 90%)
架构债务: 中等 → (优化后 低)
维护成本: 中 → (迁出后 低)
```

---

*分析完成: 2026-04-01*
