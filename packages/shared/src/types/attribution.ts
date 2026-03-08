/**
 * 故障归因系统类型定义
 * Phase 1.3: 故障归因系统
 */

import type { LogEntry, MetricSnapshot } from './incident.js';

export type HypothesisCategory = 'code_defect' | 'config_error' | 'infrastructure' | 'dependency_failure';
export type HypothesisStatus = 'proposed' | 'validating' | 'confirmed' | 'rejected' | 'superseded';

/**
 * 证据引用
 */
export interface EvidenceReference {
  evidence_id: string;
  evidence_type: 'log' | 'metric' | 'trace' | 'code' | 'config';
  description: string;
  relevance_score: number;
  timestamp: string;
}

/**
 * 证据包
 */
export interface EvidenceBundle {
  bundle_id: string;
  incident_id: string;
  collected_at: string;
  evidence_items: EvidenceItem[];
}

export interface EvidenceItem {
  item_id: string;
  type: 'log' | 'metric' | 'trace' | 'code' | 'config';
  source: string;
  content: unknown;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/**
 * 根因分析
 */
export interface RootCause {
  component: string;
  location?: string;
  commit_sha?: string;
  pattern_id?: string;
  description: string;
}

/**
 * 假设
 */
export interface Hypothesis {
  hypothesis_id: string;
  incident_id: string;
  title: string;
  description: string;
  category: HypothesisCategory;
  status: HypothesisStatus;
  confidence: number;
  root_cause: RootCause;
  evidence: {
    supporting: EvidenceReference[];
    contradicting: EvidenceReference[];
    bundle_id: string;
  };
  proposed_by: string;
  created_at: string;
  updated_at: string;
  version: number;
}

/**
 * 归因分析请求
 */
export interface AttributionRequest {
  incident_id: string;
  context: {
    logs: LogEntry[];
    metrics: MetricSnapshot[];
    traces?: TraceEntry[];
  };
  requirements: {
    max_latency_ms: number;
    min_confidence: number;
    max_hypotheses: number;
  };
}

export interface TraceEntry {
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  service: string;
  operation: string;
  start_time: string;
  end_time: string;
  status: 'ok' | 'error';
  attributes: Record<string, unknown>;
}

/**
 * 归因分析响应
 */
export interface AttributionResponse {
  analysis_id: string;
  incident_id: string;
  hypotheses: HypothesisDraft[];
  recommended_action?: string;
  confidence_summary: {
    highest: number;
    average: number;
    lowest: number;
  };
  provider_used: string;
  cost: number;
  latency_ms: number;
  created_at: string;
}

export interface HypothesisDraft {
  title: string;
  description: string;
  category: HypothesisCategory;
  confidence: number;
  root_cause: RootCause;
  evidence_summary: string[];
}

/**
 * 创建假设请求
 */
export interface CreateHypothesisRequest {
  incident_id: string;
  title: string;
  description: string;
  category: HypothesisCategory;
  root_cause: RootCause;
  evidence_bundle_id: string;
  proposed_by: string;
}

/**
 * 更新假设状态请求
 */
export interface UpdateHypothesisStatusRequest {
  status: HypothesisStatus;
  confidence?: number;
  actor_id: string;
  reason?: string;
}

/**
 * 验证假设请求
 */
export interface ValidateHypothesisRequest {
  evidence_items: EvidenceItem[];
  validation_method: 'manual' | 'automated' | 'hybrid';
  validator_id: string;
}

/**
 * 收集证据请求
 */
export interface CollectEvidenceRequest {
  incident_id: string;
  evidence_types: ('log' | 'metric' | 'trace' | 'code' | 'config')[];
  time_range: {
    from: string;
    to: string;
  };
  scope: {
    tenant_id: string;
    project_id: string;
    services?: string[];
  };
}

/**
 * 归因分析记录
 */
export interface AttributionAnalysis {
  analysis_id: string;
  incident_id: string;
  scope?: {
    tenant_id?: string;
    project_id?: string;
    actor_id?: string;
    mode?: 'local' | 'service';
  };
  hypotheses: HypothesisDraft[];
  recommended_action?: string;
  confidence_summary: {
    highest: number;
    average: number;
    lowest: number;
  };
  provider_used: string;
  cost: number;
  latency_ms: number;
  created_at: string;
}

/**
 * 归因统计
 */
export interface AttributionStats {
  total_analyses: number;
  hypotheses_by_category: Record<HypothesisCategory, number>;
  hypotheses_by_status: Record<HypothesisStatus, number>;
  average_confidence: number;
  average_latency_ms: number;
}
