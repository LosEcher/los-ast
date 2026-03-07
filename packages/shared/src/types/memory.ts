/**
 * los-memory 经验沉淀类型定义
 * Phase 1.2: 经验沉淀存储
 */

export type ProposalType =
  | 'corrected_fact'
  | 'rejected_hypothesis'
  | 'incident_lesson'
  | 'recovery_recipe';

export type ProposalStatus = 'proposed' | 'validated' | 'rejected' | 'active' | 'archived';

export interface ProposalSource {
  incident_id: string;
  evidence_bundle_id?: string;
  actor_id: string;
}

/**
 * 经验沉淀提案
 */
export interface Proposal {
  proposal_id: string;
  proposal_type: ProposalType;
  content: unknown;
  source: ProposalSource;
  status: ProposalStatus;
  validation?: {
    validated_by: string[];
    validated_at?: string;
    rejection_reason?: string;
  };
  idempotency_key: string;
  created_at: string;
  updated_at: string;
  version: number;
}

/**
 * 已修正的事实
 */
export interface CorrectedFact {
  fact_id: string;
  original_assumption: string;
  corrected_understanding: string;
  evidence_refs: string[];
  scope: {
    tenant_id: string;
    project_id: string;
  };
  source_incident_id: string;
  confidence: number;
  created_at: string;
}

/**
 * 被拒绝的假设
 */
export interface RejectedHypothesis {
  rejection_id: string;
  hypothesis_text: string;
  rejection_reason: string;
  actual_cause: string;
  evidence_refs: string[];
  scope: {
    tenant_id: string;
    project_id: string;
  };
  source_incident_id: string;
  created_at: string;
}

/**
 * 事件教训
 */
export interface IncidentLesson {
  lesson_id: string;
  incident_id: string;
  title: string;
  summary: string;
  what_happened: string;
  why_it_happened: string;
  how_we_fixed: string;
  how_to_prevent: string;
  tags: string[];
  severity: 'critical' | 'high' | 'medium' | 'low';
  scope: {
    tenant_id: string;
    project_id: string;
  };
  related_lessons: string[];
  created_at: string;
  updated_at: string;
}

/**
 * 恢复方案
 */
export interface RecoveryRecipe {
  recipe_id: string;
  name: string;
  description: string;
  triggers: {
    metric_patterns: MetricPattern[];
    log_patterns: LogPattern[];
    symptom_keywords: string[];
  };
  actions: RecoveryActionTemplate[];
  prerequisites: string[];
  estimated_duration_seconds: number;
  rollback_strategy: string;
  stats: {
    times_used: number;
    success_rate: number;
    avg_duration_seconds: number;
  };
  source: {
    type: 'manual' | 'learned';
    created_from_incident?: string;
    created_by: string;
  };
  scope: {
    tenant_id?: string;
    project_id?: string;
    is_global: boolean;
  };
  created_at: string;
  updated_at: string;
  version: number;
}

export interface MetricPattern {
  metric_name: string;
  operator: 'gt' | 'lt' | 'eq';
  threshold: number;
  duration_ms: number;
}

export interface LogPattern {
  level: string;
  contains: string;
  service?: string;
}

export interface RecoveryActionTemplate {
  step_number: number;
  name: string;
  description: string;
  action_type: 'command' | 'api_call' | 'config_change' | 'notification';
  command_template?: string;
  api_endpoint?: string;
  parameters: Record<string, unknown>;
  timeout_seconds: number;
  rollback_command?: string;
}

/**
 * 知识检索请求
 */
export interface KnowledgeQuery {
  type?: ProposalType;
  similarity?: string;
  scope?: {
    tenant_id?: string;
    project_id?: string;
  };
  tags?: string[];
  limit?: number;
  offset?: number;
}

/**
 * 知识检索响应
 */
export interface KnowledgeResponse {
  items: KnowledgeItem[];
  total: number;
  has_more: boolean;
  next_offset?: number;
}

export interface KnowledgeItem {
  item_id: string;
  item_type: ProposalType;
  title: string;
  content: unknown;
  relevance_score: number;
  source_incident_id?: string;
  created_at: string;
}

/**
 * 创建提案请求
 */
export interface CreateProposalRequest {
  proposal_type: ProposalType;
  content: unknown;
  source: ProposalSource;
  idempotency_key?: string;
}

/**
 * 验证提案请求
 */
export interface ValidateProposalRequest {
  validator_id: string;
  approve: boolean;
  rejection_reason?: string;
}

/**
 * 经验统计
 */
export interface MemoryStats {
  total_proposals: number;
  by_type: Record<ProposalType, number>;
  by_status: Record<ProposalStatus, number>;
  active_lessons: number;
  active_recipes: number;
}
