# 自迭代自优化故障恢复系统 - 设计文档

**版本**: 1.0.0
**状态**: 历史设计参考（截至 2026-03-25，当前执行请以 `docs/ACTIVE_TODO.md` 为准）
**日期**: 2026-03-07

---

## 一、系统架构

### 1.1 总体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                    用户层                                    │
│                              Dashboard / CLI / API                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              VPS Agent Web (执行控制层)                       │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │   任务编排    │ │   审批中心    │ │   审计日志    │ │   调度触发    │       │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘       │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    6个子系统 (故障恢复核心)                          │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │   │
│  │  │ 观测与  │ │ 故障归因│ │ 自动恢复│ │ 总结与  │ │ 自迭代  │ │ 热重载  │ │   │
│  │  │ 触发器  │ │ 系统   │ │ 系统   │ │ 经验沉淀│ │ 优化   │ │ 系统   │ │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
                    ▼                     ▼                     ▼
┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐
│      lsclaw             │  │      los-ast            │  │      los-memory         │
│    (智能治理层)          │  │    (代码事实层)          │  │    (经验沉淀层)          │
│  ┌───────────────────┐  │  │  ┌───────────────────┐  │  │  ┌───────────────────┐  │
│  │ Provider Routing  │  │  │  │ CodeGraph         │  │  │  │ CorrectedFact     │  │
│  │ Fallback/Retry    │  │  │  │ SymbolIndex       │  │  │  │ RejectedHypothesis│  │
│  │ Budget Control    │  │  │  │ ImpactReport      │  │  │  │ IncidentLesson    │  │
│  │ Model Selection   │  │  │  │ EvidenceBundle    │  │  │  │ RecoveryRecipe    │  │
│  └───────────────────┘  │  │  │ RewriteCandidate  │  │  │  │ OptimizationItem  │  │
└─────────────────────────┘  │  └───────────────────┘  │  └───────────────────┘  │
                             └─────────────────────────┘  └─────────────────────────┘
```

### 1.2 五闭环数据流

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  1. 发现问题  │ ──▶ │  2. 定位原因  │ ──▶ │ 3. 形成修复   │ ──▶ │ 4. 安全验证   │
│             │      │             │      │   候选       │      │   后应用     │
│  观测与触发  │      │  故障归因    │      │  自动恢复    │      │  审批中心    │
└─────────────┘      └─────────────┘      └─────────────┘      └──────┬──────┘
         ▲                                                              │
         │                                                              ▼
         │                                                       ┌─────────────┐
         │                                                       │ 5. 经验沉淀  │
         │                                                       │  并生效     │
         │                                                       │ los-memory  │
         │                                                       └──────┬──────┘
         │                                                              │
         └──────────────────────────────────────────────────────────────┘
                              (自迭代优化闭环)
```

---

## 二、核心数据模型

### 2.1 Incident (故障事件)

```typescript
interface Incident {
  incident_id: string;
  fingerprint: string;
  scope: {
    tenant_id: string;
    project_id: string;
    actor_id: string;
    trace_id: string;
  };
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  status: 'detected' | 'triaging' | 'attributed' | 'recovering' | 'resolved' | 'closed';
  source: {
    type: 'metric_alert' | 'log_pattern' | 'user_report';
    detector_id: string;
    raw_payload: unknown;
  };
  timeline: IncidentEvent[];
  hypotheses: string[];
  recovery_actions: string[];
  impact: {
    services_affected: string[];
    users_impacted?: number;
    sla_breach_risk: boolean;
  };
  created_at: string;
  updated_at: string;
  version: number;
}
```

### 2.2 Hypothesis (故障归因)

```typescript
interface Hypothesis {
  hypothesis_id: string;
  incident_id: string;
  title: string;
  description: string;
  category: 'code_defect' | 'config_error' | 'infrastructure' | 'dependency_failure';
  status: 'proposed' | 'validating' | 'confirmed' | 'rejected' | 'superseded';
  confidence: number;
  root_cause: {
    component: string;
    location?: string;
    commit_sha?: string;
    pattern_id?: string;
  };
  evidence: {
    supporting: EvidenceReference[];
    contradicting: EvidenceReference[];
    bundle: EvidenceBundle;
  };
  proposed_by: string;
  created_at: string;
  updated_at: string;
}
```

### 2.3 RecoveryAction / RecoveryRecipe

```typescript
interface RecoveryAction {
  action_id: string;
  incident_id: string;
  hypothesis_id: string;
  level: 'L1_harmless' | 'L2_controlled' | 'L3_code_level';
  type: 'restart' | 'rollback' | 'circuit_breaker' | 'feature_toggle' | 'code_patch';
  status: 'pending_approval' | 'approved' | 'executing' | 'succeeded' | 'failed' | 'rolled_back';
  safety: {
    requires_approval: boolean;
    auto_rollback_on_failure: boolean;
    estimated_downtime_seconds: number;
  };
  execution: {
    started_at?: string;
    completed_at?: string;
    result?: ExecutionResult;
  };
  created_at: string;
  updated_at: string;
}

interface RecoveryRecipe {
  recipe_id: string;
  name: string;
  triggers: {
    metric_patterns: MetricPattern[];
    log_patterns: LogPattern[];
  };
  actions: RecoveryActionTemplate[];
  stats: {
    times_used: number;
    success_rate: number;
  };
  source: {
    type: 'manual' | 'learned';
    created_from_incident?: string;
  };
}
```

### 2.4 ConfigBundle (热重载配置包)

```typescript
interface ConfigBundle {
  bundle_id: string;
  version: string;
  scope: {
    tenants?: string[];
    projects?: string[];
    percentage?: number;
  };
  configs: {
    detectors?: DetectorConfig[];
    recovery_policies?: RecoveryPolicyConfig[];
    recipes?: RecoveryRecipe[];
    thresholds?: ThresholdConfig[];
  };
  status: 'draft' | 'validated' | 'active' | 'rollback' | 'archived';
  validation: {
    checksum: string;
    validated_by: string[];
  };
  created_at: string;
  updated_at: string;
}
```

---

## 三、四项目接口契约

### 3.1 VPS Agent Web ↔ los-memory

```typescript
// 提交经验沉淀
POST /api/v1/proposals
{
  proposal_type: 'corrected_fact' | 'rejected_hypothesis' | 'incident_lesson' | 'recovery_recipe';
  content: unknown;
  source: { incident_id: string; evidence_bundle_id: string };
  idempotency_key: string;
}

// 检索知识
GET /api/v1/knowledge?type=recipe&similarity=text&limit=10
Response: {
  items: KnowledgeItem[];
  pagination: { has_more: boolean; next_cursor?: string };
}
```

### 3.2 VPS Agent Web ↔ lsclaw

```typescript
// 故障归因分析
POST /api/v1/attribution
{
  context: { incident: Incident; logs: LogEntry[]; metrics: MetricSnapshot[] };
  task: 'root_cause_analysis' | 'recovery_recommendation';
  requirements: { max_latency_ms: number; min_confidence: number };
}
Response: {
  analysis_id: string;
  hypotheses: HypothesisDraft[];
  provider_used: string;
  cost: number;
}
```

### 3.3 VPS Agent Web ↔ los-ast

```typescript
// 生成改写候选
POST /api/v1/generate-rewrite-candidate
{
  project: string;
  findings: FindingApproval[];
  options: { dry_run: boolean; max_candidates: number; safety_level: 'strict' };
}
Response: {
  candidates: RewriteCandidate[];
  summary: { total: number; ready: number; blocked: number };
}

// 验证Patch安全性
POST /api/v1/validate-patch-safety
{
  project: string;
  original_file: string;
  proposed_patch: string;
}
Response: {
  safe: boolean;
  conflicts: PatchConflict[];
  impact_estimate: { files_affected: number; symbols_affected: number };
}
```

---

## 四、6个子系统核心设计

### 4.1 观测与触发器系统

**组件**:
- `TriggerEngine`: 规则/语义/经验触发器
- `MetricsCollector`: 指标采集
- `LogPatternMatcher`: 日志模式匹配

**关键类**:
```typescript
class TriggerEngine {
  async evaluateRules(metrics: MetricSnapshot[]): Promise<Trigger[]>;
  async matchLogPatterns(logs: LogEntry[]): Promise<Trigger[]>;
  async checkHistoricalPatterns(incident: Incident): Promise<Recipe[]>;
}
```

### 4.2 故障归因系统

**组件**:
- `AttributionPipeline`: 归因流水线
- `EvidenceCollector`: 证据收集
- `HypothesisGenerator`: 假设生成

**状态机**:
```
PROPOSED → VALIDATING → CONFIRMED
    ↓           ↓
    └─────▶ REJECTED
```

### 4.3 自动恢复系统

**分级恢复**:

| 级别 | 动作 | 自动执行 | 审批 | 回滚 |
|------|------|----------|------|------|
| L1 无害 | 重启、清缓存、重连 | 是 | 否 | 自动 |
| L2 受控 | 降级、切换、回滚 | 条件触发 | 高风险需审批 | 半自动 |
| L3 代码级 | Patch、配置变更 | 否 | 必须审批 | 手动 |

### 4.4 总结与经验沉淀系统

**沉淀对象**:
1. `IncidentFact`: 确认发生了什么
2. `RejectedHypothesis`: 被证明错误的判断
3. `RecoveryRecipe`: 有效恢复步骤
4. `PreventionRule`: 预防规则

### 4.5 自迭代优化系统

**优化类型**:
- 策略优化 (lsclaw)
- 规则优化 (los-ast)
- 恢复手册优化 (VPS Agent Web)
- 测试补充 (los-memory)

### 4.6 热重载系统

**架构**:
```typescript
interface HotReloadSystem {
  configStore: Redis + PostgreSQL;
  versioning: { current: ConfigBundle; history: ConfigBundle[] };
  distribution: { watch机制: 'push'; 传播延迟: '< 5s' };
  validation: {
    pre_activate: (bundle) => ValidationResult;
    post_activate: (bundle) => HealthCheck;
    auto_rollback: boolean;
  };
}
```

**发布流程**:
1. 生成新 bundle
2. 预验证 (dry-run)
3. 金丝雀发布 (5% → 25% → 50% → 100%)
4. 观测健康指标
5. 全量生效或回滚

---

## 五、MVP范围 (Phase 1)

### 5.1 边界

**包含**:
- 观测与触发器系统 (基础指标 + 日志告警)
- 故障归因系统 (单假设 + 基础证据)
- 自动恢复系统 (L1 + L2)
- 审批中心 (人工 + 自动规则)
- 经验沉淀 (IncidentLesson)
- 热重载 (配置更新 API)

**不包含**:
- L3 代码级自动恢复
- 多假设并行分析
- 自动化规则生成
- 预测性故障检测

### 5.2 交付物

| 项目 | MVP交付 | 验收标准 |
|------|---------|----------|
| VPS Agent Web | Incident API + 审批流 + Dashboard | 能创建/查询/审批 |
| lsclaw | 归因模型调用 + 路由策略 | 能返回归因分析 |
| los-ast | evidence bundle + patch safety | API可调用 |
| los-memory | lesson存储 + 查询 | 能写入/查询经验 |

---

## 六、部署架构

### 6.1 生产部署

```
┌─────────────────────────────────────────────────────────────────┐
│                         Load Balancer                          │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        ▼                         ▼                         ▼
┌───────────────┐        ┌───────────────┐        ┌───────────────┐
│  API Server   │        │  API Server   │        │  API Server   │
│  (Instance 1) │        │  (Instance 2) │        │  (Instance N) │
│               │        │               │        │               │
│ ┌───────────┐ │        │ ┌───────────┐ │        │ ┌───────────┐ │
│ │ Config    │ │        │ │ Config    │ │        │ │ Config    │ │
│ │ Manager   │ │        │ │ Manager   │ │        │ │ Manager   │ │
│ └───────────┘ │        │ └───────────┘ │        │ └───────────┘ │
└───────┬───────┘        └───────┬───────┘        └───────┬───────┘
        └────────────────────────┼────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    ▼                         ▼
          ┌─────────────────┐      ┌─────────────────┐
          │   Redis Cluster │      │   PostgreSQL    │
          │  ├─ Config Store│      │  ├─ Bundle Meta │
          │  ├─ Event PubSub│      │  ├─ Audit Log   │
          │  └─ Rate Limit  │      │  └─ Snapshots   │
          └─────────────────┘      └─────────────────┘
```

### 6.2 技术选型

| 组件 | 选择 | 理由 |
|------|------|------|
| 配置存储 | Redis + PostgreSQL | 热数据 + 持久化 |
| 事件总线 | Redis Streams | 持久化 + 消费者组 |
| 热重载 | Pub/Sub + Watch | 实时 + 可靠 |
| 金丝雀 | Flagger | K8s原生 + 自动回滚 |
| 观测 | Prometheus + Grafana | 生态成熟 |
| 追踪 | Jaeger | 开源 + 易集成 |

---

## 七、关键决策

1. **事件总线**: Redis Streams (兼顾简单与可靠)
2. **配置版本控制**: Semver + Bundle ID
3. **热重载触发**: Pub/Sub + Stream持久化
4. **灰度策略**: 百分比 + 健康指标 + 自动回滚
5. **审批安全**: HMAC签名 + SSE通知 + 乐观锁
6. **部署策略**: K8s + Flagger金丝雀

---

## 八、文档索引

| 文档 | 路径 | 说明 |
|------|------|------|
| 本文档 | `docs/self-healing-system-design.md` | 设计总文档 |
| 架构边界 | `docs/architecture-boundary-spec.md` | 四项目边界 |
| los-ast路线图 | `docs/implementation-roadmap-v1.1.md` | los-ast服务化 |
| 实施计划 | `docs/implementation-plan-consolidated.md` | API服务实施 |

---

**结论**: 本设计整合了四项目能力，通过6个子系统实现自迭代故障恢复闭环。MVP聚焦"检测→归因→恢复→沉淀"最简闭环，后续迭代逐步增强智能化能力。
