/**
 * 自动恢复存储服务
 * Phase 1.4: L1/L2 自动恢复系统
 */
import type { RecoveryAction, RecoveryActionStatus, ExecuteRecoveryActionRequest, ExecutionResult, RecoveryPolicy } from '@los-ast/shared/types';
/**
 * 创建恢复动作
 */
export declare function createRecoveryAction(request: ExecuteRecoveryActionRequest): Promise<RecoveryAction>;
/**
 * 获取恢复动作
 */
export declare function getRecoveryAction(actionId: string): Promise<RecoveryAction | null>;
/**
 * 更新恢复动作状态
 */
export declare function updateRecoveryActionStatus(actionId: string, newStatus: RecoveryActionStatus, result?: ExecutionResult): Promise<RecoveryAction | null>;
/**
 * 开始执行恢复动作
 */
export declare function startRecoveryAction(actionId: string): Promise<RecoveryAction | null>;
/**
 * 执行 L1 恢复动作
 */
export declare function executeL1Action(action: RecoveryAction): Promise<ExecutionResult>;
/**
 * 执行 L2 恢复动作
 */
export declare function executeL2Action(action: RecoveryAction): Promise<ExecutionResult>;
/**
 * 查询恢复动作
 */
export declare function queryRecoveryActions(params: {
    incident_id?: string;
    status?: RecoveryActionStatus;
    level?: string;
    limit?: number;
    offset?: number;
}): Promise<{
    items: RecoveryAction[];
    total: number;
}>;
/**
 * 创建恢复策略
 */
export declare function createRecoveryPolicy(policy: Omit<RecoveryPolicy, 'policy_id' | 'created_at' | 'updated_at'>): Promise<RecoveryPolicy>;
/**
 * 获取恢复策略
 */
export declare function getRecoveryPolicy(policyId: string): Promise<RecoveryPolicy | null>;
/**
 * 获取所有恢复策略
 */
export declare function listRecoveryPolicies(): Promise<RecoveryPolicy[]>;
/**
 * 获取统计信息
 */
export declare function getRecoveryStats(): {
    totalActions: number;
    byLevel: Record<string, number>;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
};
/**
 * 清空存储 (用于测试)
 */
export declare function clearRecoveryStore(): void;
//# sourceMappingURL=store.d.ts.map