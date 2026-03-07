/**
 * 审批中心存储服务
 * Phase 1.5: 审批中心工作流
 */
import type { ApprovalItem, CreateApprovalRequest, ProcessApprovalRequest, ApprovalQueryParams } from '@los-ast/shared/types';
/**
 * 创建审批项
 */
export declare function createApproval(request: CreateApprovalRequest): Promise<ApprovalItem>;
/**
 * 获取审批项
 */
export declare function getApproval(approvalId: string): Promise<ApprovalItem | null>;
/**
 * 处理审批
 */
export declare function processApproval(approvalId: string, request: ProcessApprovalRequest): Promise<ApprovalItem | null>;
/**
 * 查询审批项
 */
export declare function queryApprovals(params: ApprovalQueryParams): Promise<{
    items: ApprovalItem[];
    total: number;
    has_more: boolean;
    next_offset?: number;
}>;
/**
 * 检查并更新超时审批
 */
export declare function checkExpiredApprovals(): Promise<number>;
/**
 * 获取统计信息
 */
export declare function getApprovalStats(): {
    total: number;
    by_status: Record<string, number>;
    by_risk_level: Record<string, number>;
    by_type: Record<string, number>;
};
/**
 * 清空存储 (用于测试)
 */
export declare function clearApprovalStore(): void;
//# sourceMappingURL=store.d.ts.map