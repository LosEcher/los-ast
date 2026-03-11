/**
 * 审批中心存储服务
 * Phase 1.5: 审批中心工作流
 */

import type {
  ApprovalItem,
  CreateApprovalRequest,
  ProcessApprovalRequest,
  ApprovalQueryParams,
} from '@los-ast/shared/types';
import { generateId } from '../../utils/id-generator.js';

// 内存存储
const approvalStore: Map<string, ApprovalItem> = new Map();

/**
 * 创建审批项
 */
export async function createApproval(
  request: CreateApprovalRequest,
  actorId: string
): Promise<ApprovalItem> {
  const now = new Date().toISOString();
  const approvalId = generateId('apr');

  // 计算超时时间
  const timeoutAt = new Date(Date.now() + request.timeout_seconds * 1000).toISOString();

  const approval: ApprovalItem = {
    approval_id: approvalId,
    item_type: request.item_type,
    item_id: request.item_id,
    title: request.title,
    description: request.description,
    risk_level: request.risk_level,
    status: 'pending',
    requester: {
      actor_id: actorId,
      timestamp: now,
    },
    timeout_at: timeoutAt,
    scope: request.scope,
    metadata: request.metadata,
    created_at: now,
    updated_at: now,
    version: 1,
  };

  approvalStore.set(approvalId, approval);
  console.log(`[ApprovalStore] Created approval ${approvalId}: ${approval.title} (${approval.risk_level})`);

  return approval;
}

/**
 * 获取审批项
 */
export async function getApproval(approvalId: string): Promise<ApprovalItem | null> {
  return approvalStore.get(approvalId) || null;
}

/**
 * 获取审批项（带 scope 校验）
 * 返回 null 如果审批项不存在或 scope 不匹配
 */
export async function getApprovalWithScope(
  approvalId: string,
  tenant_id: string,
  project_id: string
): Promise<ApprovalItem | null> {
  const approval = approvalStore.get(approvalId);
  if (!approval) {
    return null;
  }
  // 强制 scope 边界检查
  if (approval.scope.tenant_id !== tenant_id || approval.scope.project_id !== project_id) {
    return null;
  }
  return approval;
}

/**
 * 处理审批
 */
export async function processApproval(
  approvalId: string,
  request: ProcessApprovalRequest
): Promise<ApprovalItem | null> {
  const approval = approvalStore.get(approvalId);
  if (!approval) {
    return null;
  }

  // 检查状态
  if (approval.status !== 'pending') {
    throw new Error(`Approval is already ${approval.status}`);
  }

  // 检查是否超时
  if (new Date() > new Date(approval.timeout_at)) {
    approval.status = 'expired';
    approval.updated_at = new Date().toISOString();
    approval.version += 1;
    approvalStore.set(approvalId, approval);
    throw new Error('Approval has expired');
  }

  const now = new Date().toISOString();

  approval.status = request.action === 'approve' ? 'approved' : 'rejected';
  approval.approver = {
    actor_id: request.actor_id,
    timestamp: now,
    comment: request.comment,
  };
  approval.updated_at = now;
  approval.version += 1;

  approvalStore.set(approvalId, approval);
  console.log(`[ApprovalStore] Processed approval ${approvalId}: ${approval.status} by ${request.actor_id}`);

  return approval;
}

/**
 * 查询审批项 (强制按 scope 过滤)
 */
export async function queryApprovals(params: ApprovalQueryParams): Promise<{
  items: ApprovalItem[];
  total: number;
  has_more: boolean;
  next_offset?: number;
}> {
  // 强制要求 tenant_id 和 project_id
  if (!params.tenant_id || !params.project_id) {
    throw new Error('tenant_id and project_id are required for queryApprovals');
  }

  let items = Array.from(approvalStore.values());

  // 强制按 scope 过滤 (不再可选)
  items = items.filter((a) =>
    a.scope.tenant_id === params.tenant_id &&
    a.scope.project_id === params.project_id
  );

  if (params.status) {
    items = items.filter((a) => a.status === params.status);
  }

  if (params.risk_level) {
    items = items.filter((a) => a.risk_level === params.risk_level);
  }

  if (params.item_type) {
    items = items.filter((a) => a.item_type === params.item_type);
  }

  // 按创建时间降序
  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const total = items.length;
  const offset = params.offset || 0;
  const limit = params.limit || 20;

  items = items.slice(offset, offset + limit);

  return {
    items,
    total,
    has_more: offset + limit < total,
    next_offset: offset + limit < total ? offset + limit : undefined,
  };
}

/**
 * 检查并更新超时审批
 */
export async function checkExpiredApprovals(): Promise<number> {
  let expiredCount = 0;
  const now = new Date().toISOString();

  for (const [id, approval] of approvalStore.entries()) {
    if (approval.status === 'pending' && new Date() > new Date(approval.timeout_at)) {
      approval.status = 'expired';
      approval.updated_at = now;
      approval.version += 1;
      approvalStore.set(id, approval);
      expiredCount++;
      console.log(`[ApprovalStore] Approval ${id} expired`);
    }
  }

  return expiredCount;
}

/**
 * 获取统计信息 (按 scope 过滤)
 */
export function getApprovalStats(
  tenant_id: string,
  project_id: string
): {
  total: number;
  by_status: Record<string, number>;
  by_risk_level: Record<string, number>;
  by_type: Record<string, number>;
} {
  const by_status: Record<string, number> = {};
  const by_risk_level: Record<string, number> = {};
  const by_type: Record<string, number> = {};
  let total = 0;

  for (const approval of approvalStore.values()) {
    // 强制按 scope 过滤
    if (approval.scope.tenant_id !== tenant_id || approval.scope.project_id !== project_id) {
      continue;
    }
    total++;
    by_status[approval.status] = (by_status[approval.status] || 0) + 1;
    by_risk_level[approval.risk_level] = (by_risk_level[approval.risk_level] || 0) + 1;
    by_type[approval.item_type] = (by_type[approval.item_type] || 0) + 1;
  }

  return {
    total,
    by_status,
    by_risk_level,
    by_type,
  };
}

/**
 * 清空存储 (用于测试)
 */
export function clearApprovalStore(): void {
  approvalStore.clear();
}
