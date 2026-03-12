/**
 * 审批中心工作流类型定义
 * Phase 1.5: 审批中心工作流
 */

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';
export type ApprovalItemType = 'recovery_action' | 'code_patch' | 'config_change' | 'recipe_activation';

/**
 * 审批项
 */
export interface ApprovalItem {
  approval_id: string;
  item_type: ApprovalItemType;
  item_id: string;
  title: string;
  description: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  status: ApprovalStatus;
  requester: {
    actor_id: string;
    timestamp: string;
  };
  approver?: {
    actor_id: string;
    timestamp: string;
    comment?: string;
  };
  timeout_at: string;
  scope: {
    tenant_id: string;
    project_id: string;
  };
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  version: number;
}

/**
 * 创建审批请求
 */
export interface CreateApprovalRequest {
  item_type: ApprovalItemType;
  item_id: string;
  title: string;
  description: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  timeout_seconds: number;
  scope?: {
    tenant_id?: string;
    project_id?: string;
  };
  metadata?: Record<string, unknown>;
}

/**
 * 审批操作请求
 */
export interface ProcessApprovalRequest {
  action: 'approve' | 'reject';
  actor_id?: string;
  comment?: string;
}

/**
 * 审批查询参数
 */
export interface ApprovalQueryParams {
  tenant_id?: string;
  project_id?: string;
  status?: ApprovalStatus;
  risk_level?: string;
  item_type?: ApprovalItemType;
  limit?: number;
  offset?: number;
}

/**
 * 审批统计
 */
export interface ApprovalStats {
  total: number;
  by_status: Record<ApprovalStatus, number>;
  by_risk_level: Record<string, number>;
  by_type: Record<ApprovalItemType, number>;
  avg_decision_time_seconds: number;
}

/**
 * HMAC 签名头
 */
export interface HMACHeaders {
  'x-signature': string;
  'x-timestamp': string;
  'x-nonce': string;
  'x-key-id': string;
}

/**
 * 审批回调请求
 */
export interface ApprovalCallbackRequest {
  job_id: string;
  action: 'approve' | 'reject';
  actor_id: string;
  timestamp: number;
  version: number;
  reason?: string;
}

/**
 * SSE 事件
 */
export interface ApprovalEvent {
  event: string;
  id: string;
  data: {
    approval_id: string;
    item_type: ApprovalItemType;
    status: ApprovalStatus;
    risk_level: string;
    title: string;
  };
}
