/**
 * 审批中心存储服务
 * Phase 1.5: 审批中心工作流
 */

import type {
  ApprovalItem,
  ApprovalStats,
  CreateApprovalRequest,
  ProcessApprovalRequest,
  ApprovalQueryParams,
} from '@los-ast/shared/types';
import { generateId } from '../../utils/id-generator.js';
import { approvalRepository } from '../../persistence/repositories/approval-repository.js';

/**
 * 创建审批项
 */
export async function createApproval(
  request: Omit<CreateApprovalRequest, 'scope'> & {
    scope: {
      tenant_id: string;
      project_id: string;
    };
  },
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

  approvalRepository.set(approvalId, approval);
  console.log(`[ApprovalStore] Created approval ${approvalId}: ${approval.title} (${approval.risk_level})`);

  return approval;
}

/**
 * 获取审批项
 */
export async function getApproval(approvalId: string): Promise<ApprovalItem | null> {
  return approvalRepository.get(approvalId) || null;
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
  const approval = approvalRepository.get(approvalId);
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
  request: Omit<ProcessApprovalRequest, 'actor_id'> & { actor_id: string }
): Promise<ApprovalItem | null> {
  const approval = approvalRepository.get(approvalId);
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
    approvalRepository.set(approvalId, approval);
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

  approvalRepository.set(approvalId, approval);
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
  return approvalRepository.query(params);
}

/**
 * 检查并更新超时审批
 */
export async function checkExpiredApprovals(): Promise<number> {
  let expiredCount = 0;
  const now = new Date().toISOString();

  for (const [id, approval] of approvalRepository.listPendingExpired(now)) {
    approval.status = 'expired';
    approval.updated_at = now;
    approval.version += 1;
    approvalRepository.set(id, approval);
    expiredCount++;
    console.log(`[ApprovalStore] Approval ${id} expired`);
  }

  return expiredCount;
}

/**
 * 获取统计信息 (按 scope 过滤)
 */
export function getApprovalStats(
  tenant_id: string,
  project_id: string
): ApprovalStats {
  return approvalRepository.getStats(tenant_id, project_id);
}

/**
 * 清空存储 (用于测试)
 */
export function clearApprovalStore(): void {
  approvalRepository.clear();
}
