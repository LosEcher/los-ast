/**
 * 自动恢复存储服务
 * Phase 1.4: L1/L2 自动恢复系统
 */

import type {
  RecoveryAction,
  RecoveryActionStatus,
  ExecuteRecoveryActionRequest,
  ExecutionResult,
  RecoveryPolicy,
} from '@los-ast/shared/types';
import { generateId } from '../../utils/id-generator.js';

// 内存存储
const actionStore: Map<string, RecoveryAction> = new Map();
const policyStore: Map<string, RecoveryPolicy> = new Map();
const cooldownStore: Map<string, number> = new Map();

/**
 * 创建恢复动作
 */
export async function createRecoveryAction(
  request: ExecuteRecoveryActionRequest
): Promise<RecoveryAction> {
  const now = new Date().toISOString();
  const actionId = generateId('act');

  // 检查是否需要审批
  const policy = await getRecoveryPolicyForLevel(request.level);
  const requiresApproval = shouldRequireApproval(policy, request);

  const action: RecoveryAction = {
    action_id: actionId,
    incident_id: request.incident_id,
    hypothesis_id: request.hypothesis_id,
    level: request.level,
    type: request.type,
    status: requiresApproval ? 'pending_approval' : 'approved',
    safety: {
      requires_approval: requiresApproval,
      auto_rollback_on_failure: request.level !== 'L1_harmless',
      estimated_downtime_seconds: estimateDowntime(request.type),
    },
    execution: {},
    created_at: now,
    updated_at: now,
  };

  actionStore.set(actionId, action);
  console.log(`[RecoveryStore] Created recovery action ${actionId}: ${action.type} (${action.level})`);

  return action;
}

/**
 * 获取恢复策略
 */
async function getRecoveryPolicyForLevel(level: string): Promise<RecoveryPolicy | undefined> {
  for (const policy of policyStore.values()) {
    if (policy.level === level) {
      return policy;
    }
  }
  return undefined;
}

/**
 * 判断是否需要审批
 */
function shouldRequireApproval(
  policy: RecoveryPolicy | undefined,
  request: ExecuteRecoveryActionRequest
): boolean {
  if (!policy) return true;

  // L1 动作通常不需要审批
  if (request.level === 'L1_harmless' && policy.auto_execute) {
    return false;
  }

  // L2 根据策略决定
  if (request.level === 'L2_controlled') {
    // 检查冷却期
    const cooldownKey = `${request.incident_id}:${request.type}`;
    const lastExecuted = cooldownStore.get(cooldownKey) || 0;
    const now = Date.now();
    if (now - lastExecuted < policy.cooldown_seconds * 1000) {
      return true; // 冷却期内需要审批
    }

    return !policy.auto_execute;
  }

  // L3 代码级必须审批
  return true;
}

/**
 * 估计停机时间
 */
function estimateDowntime(type: string): number {
  const estimates: Record<string, number> = {
    restart: 30,
    rollback: 60,
    circuit_breaker: 5,
    feature_toggle: 10,
    code_patch: 300,
  };
  return estimates[type] || 60;
}

/**
 * 获取恢复动作
 */
export async function getRecoveryAction(actionId: string): Promise<RecoveryAction | null> {
  return actionStore.get(actionId) || null;
}

/**
 * 更新恢复动作状态
 */
export async function updateRecoveryActionStatus(
  actionId: string,
  newStatus: RecoveryActionStatus,
  result?: ExecutionResult
): Promise<RecoveryAction | null> {
  const action = actionStore.get(actionId);
  if (!action) {
    return null;
  }

  action.status = newStatus;
  action.updated_at = new Date().toISOString();

  if (result) {
    action.execution.result = result;
    action.execution.completed_at = new Date().toISOString();

    // 记录冷却期
    if (newStatus === 'succeeded' || newStatus === 'failed') {
      const cooldownKey = `${action.incident_id}:${action.type}`;
      cooldownStore.set(cooldownKey, Date.now());
    }
  }

  actionStore.set(actionId, action);
  console.log(`[RecoveryStore] Updated recovery action ${actionId} status to ${newStatus}`);

  return action;
}

/**
 * 开始执行恢复动作
 */
export async function startRecoveryAction(actionId: string): Promise<RecoveryAction | null> {
  const action = actionStore.get(actionId);
  if (!action) {
    return null;
  }

  action.status = 'executing';
  action.execution.started_at = new Date().toISOString();
  action.updated_at = action.execution.started_at;

  actionStore.set(actionId, action);
  console.log(`[RecoveryStore] Started executing recovery action ${actionId}`);

  return action;
}

/**
 * 执行 L1 恢复动作
 */
export async function executeL1Action(action: RecoveryAction): Promise<ExecutionResult> {
  console.log(`[Recovery] Executing L1 action: ${action.type}`);

  const startTime = Date.now();

  try {
    // 模拟 L1 动作执行
    await simulateActionExecution(action);

    const duration = Date.now() - startTime;

    return {
      success: true,
      output: `L1 action ${action.type} completed successfully`,
      duration_ms: duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration_ms: duration,
    };
  }
}

/**
 * 执行 L2 恢复动作
 */
export async function executeL2Action(action: RecoveryAction): Promise<ExecutionResult> {
  console.log(`[Recovery] Executing L2 action: ${action.type}`);

  const startTime = Date.now();

  try {
    // 模拟 L2 动作执行
    await simulateActionExecution(action);

    const duration = Date.now() - startTime;

    return {
      success: true,
      output: `L2 action ${action.type} completed successfully`,
      duration_ms: duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration_ms: duration,
    };
  }
}

/**
 * 模拟动作执行
 */
async function simulateActionExecution(action: RecoveryAction): Promise<void> {
  // 模拟执行延迟
  const delay = Math.random() * 1000 + 500;
  await new Promise((resolve) => setTimeout(resolve, delay));

  // 模拟偶尔的失败 (5% 概率)
  if (Math.random() < 0.05) {
    throw new Error(`Simulated failure for ${action.type}`);
  }
}

/**
 * 查询恢复动作
 */
export async function queryRecoveryActions(params: {
  incident_id?: string;
  status?: RecoveryActionStatus;
  level?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: RecoveryAction[]; total: number }> {
  let items = Array.from(actionStore.values());

  if (params.incident_id) {
    items = items.filter((a) => a.incident_id === params.incident_id);
  }

  if (params.status) {
    items = items.filter((a) => a.status === params.status);
  }

  if (params.level) {
    items = items.filter((a) => a.level === params.level);
  }

  const total = items.length;
  const offset = params.offset || 0;
  const limit = params.limit || 20;

  items = items.slice(offset, offset + limit);

  return { items, total };
}

/**
 * 创建恢复策略
 */
export async function createRecoveryPolicy(policy: Omit<RecoveryPolicy, 'policy_id' | 'created_at' | 'updated_at'>): Promise<RecoveryPolicy> {
  const now = new Date().toISOString();
  const policyId = generateId('pol');

  const newPolicy: RecoveryPolicy = {
    ...policy,
    policy_id: policyId,
    created_at: now,
    updated_at: now,
  };

  policyStore.set(policyId, newPolicy);
  console.log(`[RecoveryStore] Created recovery policy ${policyId}: ${newPolicy.name}`);

  return newPolicy;
}

/**
 * 获取恢复策略
 */
export async function getRecoveryPolicy(policyId: string): Promise<RecoveryPolicy | null> {
  return policyStore.get(policyId) || null;
}

/**
 * 获取所有恢复策略
 */
export async function listRecoveryPolicies(): Promise<RecoveryPolicy[]> {
  return Array.from(policyStore.values());
}

/**
 * 获取统计信息
 */
export function getRecoveryStats(): {
  totalActions: number;
  byLevel: Record<string, number>;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
} {
  const actions = Array.from(actionStore.values());

  const byLevel: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};

  for (const action of actions) {
    byLevel[action.level] = (byLevel[action.level] || 0) + 1;
    byStatus[action.status] = (byStatus[action.status] || 0) + 1;
    byType[action.type] = (byType[action.type] || 0) + 1;
  }

  return {
    totalActions: actions.length,
    byLevel,
    byStatus,
    byType,
  };
}

/**
 * 清空存储 (用于测试)
 */
export function clearRecoveryStore(): void {
  actionStore.clear();
  policyStore.clear();
  cooldownStore.clear();
}
