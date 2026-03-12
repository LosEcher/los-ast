/**
 * Incident 类型定义
 * Phase 1.1: Incident 数据模型与采集系统
 */

export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type IncidentStatus = 'detected' | 'triaging' | 'attributed' | 'recovering' | 'resolved' | 'closed';
export type IncidentSourceType = 'metric_alert' | 'log_pattern' | 'user_report';

export interface IncidentScope {
  tenant_id: string;
  project_id: string;
  actor_id: string;
  trace_id: string;
}

export interface IncidentEvent {
  timestamp: string;
  type: string;
  description: string;
  actor?: string;
  metadata?: Record<string, unknown>;
}

export interface IncidentImpact {
  services_affected: string[];
  users_impacted?: number;
  sla_breach_risk: boolean;
}

export interface IncidentSource {
  type: IncidentSourceType;
  detector_id: string;
  raw_payload: unknown;
}

/**
 * Incident 主数据模型
 */
export interface Incident {
  incident_id: string;
  fingerprint: string;
  scope: IncidentScope;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  source: IncidentSource;
  timeline: IncidentEvent[];
  hypotheses: string[];
  recovery_actions: string[];
  impact: IncidentImpact;
  created_at: string;
  updated_at: string;
  version: number;
}

/**
 * 创建 Incident 请求
 */
export interface CreateIncidentRequest {
  scope?: Partial<IncidentScope>;
  title: string;
  description: string;
  severity: IncidentSeverity;
  source: IncidentSource;
  impact?: Partial<IncidentImpact>;
}

/**
 * 更新 Incident 状态请求
 */
export interface UpdateIncidentStatusRequest {
  status: IncidentStatus;
  comment?: string;
  actor_id?: string;
}

/**
 * Incident 查询参数
 */
export interface IncidentQueryParams {
  tenant_id?: string;
  project_id?: string;
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  source_type?: IncidentSourceType;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

/**
 * Incident 列表响应
 */
export interface IncidentListResponse {
  items: Incident[];
  total: number;
  has_more: boolean;
  next_offset?: number;
}

/**
 * Metric 数据点
 */
export interface MetricDataPoint {
  timestamp: string;
  metric_name: string;
  value: number;
  labels: Record<string, string>;
}

/**
 * 日志条目
 */
export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  service: string;
  trace_id?: string;
  span_id?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 指标快照
 */
export interface MetricSnapshot {
  timestamp: string;
  metrics: MetricDataPoint[];
}

/**
 * 采集数据上报请求
 */
export interface CollectMetricsRequest {
  scope?: Partial<IncidentScope>;
  metrics: MetricDataPoint[];
}

export interface CollectLogsRequest {
  scope?: Partial<IncidentScope>;
  logs: LogEntry[];
}

/**
 * 触发器定义
 */
export interface Trigger {
  trigger_id: string;
  name: string;
  condition: {
    metric_name?: string;
    operator: 'gt' | 'lt' | 'eq' | 'contains';
    threshold: number | string;
    duration_ms?: number;
  };
  severity: IncidentSeverity;
  auto_create_incident: boolean;
  cooldown_ms: number;
}

/**
 * 触发器评估结果
 */
export interface TriggerEvaluation {
  trigger_id: string;
  triggered: boolean;
  timestamp: string;
  matched_metrics: MetricDataPoint[];
  value: number;
}
