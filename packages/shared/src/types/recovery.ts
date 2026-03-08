/**
 * 自动恢复系统类型定义
 * Phase 1.4: L1/L2 自动恢复系统
 */

export type RecoveryLevel = 'L1_harmless' | 'L2_controlled' | 'L3_code_level';
export type RecoveryActionType = 'restart' | 'rollback' | 'circuit_breaker' | 'feature_toggle' | 'code_patch';
export type RecoveryActionStatus = 'pending_approval' | 'approved' | 'executing' | 'succeeded' | 'failed' | 'rolled_back';

/**
 * 恢复动作
 */
export interface RecoveryAction {
  action_id: string;
  incident_id: string;
  hypothesis_id: string;
  level: RecoveryLevel;
  type: RecoveryActionType;
  status: RecoveryActionStatus;
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

export interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  duration_ms: number;
}

/**
 * 恢复动作模板
 */
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

/**
 * 执行恢复动作请求
 */
export interface ExecuteRecoveryActionRequest {
  incident_id: string;
  hypothesis_id: string;
  level: RecoveryLevel;
  type: RecoveryActionType;
  parameters: Record<string, unknown>;
  actor_id: string;
}

/**
 * 执行恢复动作响应
 */
export interface ExecuteRecoveryActionResponse {
  action_id: string;
  status: RecoveryActionStatus;
  message: string;
  estimated_duration_seconds: number;
}

/**
 * 回滚请求
 */
export interface RollbackRequest {
  action_id: string;
  reason: string;
  actor_id: string;
}

/**
 * 恢复统计
 */
export interface RecoveryStats {
  total_actions: number;
  by_level: Record<RecoveryLevel, number>;
  by_status: Record<RecoveryActionStatus, number>;
  by_type: Record<RecoveryActionType, number>;
  success_rate: number;
  avg_execution_time_ms: number;
}

/**
 * L1/L2 恢复策略配置
 */
export interface RecoveryPolicy {
  policy_id: string;
  name: string;
  level: RecoveryLevel;
  auto_execute: boolean;
  require_approval_threshold?: {
    estimated_downtime_seconds: number;
    affected_services: number;
  };
  allowed_actions: RecoveryActionType[];
  cooldown_seconds: number;
  created_at: string;
  updated_at: string;
}
