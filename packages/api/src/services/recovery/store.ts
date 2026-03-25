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
  RecoveryStats,
} from '@los-ast/shared/types';
import { PERSISTENCE_CONFIG } from '../../config/index.js';
import { runInSqliteTransaction } from '../../persistence/sqlite-database.js';
import { generateId } from '../../utils/id-generator.js';
import { recoveryRepository } from '../../persistence/repositories/recovery-repository.js';
import { addRecoveryActionToIncident } from '../incident/store.js';
import {
  applyRecoveryActionStart,
  applyRecoveryActionStatusUpdate,
  buildRecoveryActionEntity,
  buildRecoveryPolicyEntity,
  executeRecoveryActionSimulation,
  getRecoveryCooldownKey,
  hasRecoveryActionScope,
  shouldRequireRecoveryApproval,
} from './shared.js';

const actionStore = recoveryRepository.actions;
const policyStore = recoveryRepository.policies;
const cooldownStore = recoveryRepository.cooldowns;

/**
 * 创建恢复动作
 */
export async function createRecoveryAction(
  request: ExecuteRecoveryActionRequest,
  scope: {
    tenant_id: string;
    project_id: string;
  }
): Promise<RecoveryAction> {
  const now = new Date().toISOString();
  const actionId = generateId('act');

  const policy = await getRecoveryPolicyForLevel(request.level);
  const cooldownKey = getRecoveryCooldownKey(request.incident_id, request.type);
  const requiresApproval = shouldRequireRecoveryApproval({
    policy,
    request,
    lastExecutedAtMs: cooldownStore.get(cooldownKey) || 0,
  });
  const action = buildRecoveryActionEntity({
    actionId,
    request,
    scope,
    requiresApproval,
    now,
  });

  await runRecoveryMutation(async () => {
    actionStore.set(actionId, action);
    const incident = await addRecoveryActionToIncident(request.incident_id, actionId);
    if (!incident) {
      throw new Error(`Incident ${request.incident_id} not found when attaching recovery action`);
    }
  });
  console.log(`[RecoveryStore] Created recovery action ${actionId}: ${action.type} (${action.level})`);

  return action;
}

/**
 * 获取恢复策略
 */
async function getRecoveryPolicyForLevel(level: string): Promise<RecoveryPolicy | undefined> {
  return policyStore.getByLevel(level);
}

/**
 * 获取恢复动作
 */
export async function getRecoveryAction(actionId: string): Promise<RecoveryAction | null> {
  return actionStore.get(actionId) || null;
}

export async function getRecoveryActionWithScope(
  actionId: string,
  tenant_id: string,
  project_id: string
): Promise<RecoveryAction | null> {
  const action = actionStore.get(actionId);
  if (!action) {
    return null;
  }

  if (!hasRecoveryActionScope(action, tenant_id, project_id)) {
    return null;
  }

  return action;
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

  const updatedAt = new Date().toISOString();

  await runRecoveryMutation(() => {
    applyRecoveryActionStatusUpdate({
      action,
      newStatus,
      updatedAt,
      result,
      completedAt: new Date().toISOString(),
    });

    if (result && (newStatus === 'succeeded' || newStatus === 'failed')) {
      cooldownStore.set(getRecoveryCooldownKey(action.incident_id, action.type), Date.now());
    }

    actionStore.set(actionId, action);
  });
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

  applyRecoveryActionStart(action, new Date().toISOString());

  actionStore.set(actionId, action);
  console.log(`[RecoveryStore] Started executing recovery action ${actionId}`);

  return action;
}

/**
 * 执行 L1 恢复动作
 */
export async function executeL1Action(action: RecoveryAction): Promise<ExecutionResult> {
  console.log(`[Recovery] Executing L1 action: ${action.type}`);
  return executeRecoveryActionSimulation({
    action,
    levelLabel: 'L1',
  });
}

/**
 * 执行 L2 恢复动作
 */
export async function executeL2Action(action: RecoveryAction): Promise<ExecutionResult> {
  console.log(`[Recovery] Executing L2 action: ${action.type}`);
  return executeRecoveryActionSimulation({
    action,
    levelLabel: 'L2',
  });
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
  scope?: {
    tenant_id?: string;
    project_id?: string;
  };
}): Promise<{ items: RecoveryAction[]; total: number }> {
  return actionStore.query(params);
}

/**
 * 创建恢复策略
 */
export async function createRecoveryPolicy(policy: Omit<RecoveryPolicy, 'policy_id' | 'created_at' | 'updated_at'>): Promise<RecoveryPolicy> {
  const now = new Date().toISOString();
  const policyId = generateId('pol');
  const newPolicy = buildRecoveryPolicyEntity({ policyId, policy, now });

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
  return policyStore.values();
}

/**
 * 获取统计信息
 */
export function getRecoveryStats(scope?: {
  tenant_id?: string;
  project_id?: string;
}): RecoveryStats {
  return actionStore.getStats(scope);
}

/**
 * 清空存储 (用于测试)
 */
export function clearRecoveryStore(): void {
  actionStore.clear();
  policyStore.clear();
  cooldownStore.clear();
}

async function runRecoveryMutation<T>(callback: () => T | Promise<T>): Promise<T> {
  if (PERSISTENCE_CONFIG.experimentalStoreBackend !== 'sqlite') {
    return callback();
  }

  return runInSqliteTransaction(async () => callback());
}
