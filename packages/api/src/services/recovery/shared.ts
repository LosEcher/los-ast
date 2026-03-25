import type {
  ExecuteRecoveryActionRequest,
  ExecutionResult,
  RecoveryAction,
  RecoveryActionStatus,
  RecoveryPolicy,
} from '@los-ast/shared/types';

export function getRecoveryCooldownKey(
  incidentId: string,
  type: RecoveryAction['type']
) {
  return `${incidentId}:${type}`;
}

export function estimateRecoveryDowntime(type: RecoveryAction['type']): number {
  const estimates: Record<RecoveryAction['type'], number> = {
    restart: 30,
    rollback: 60,
    circuit_breaker: 5,
    feature_toggle: 10,
    code_patch: 300,
  };
  return estimates[type] ?? 60;
}

export function shouldRequireRecoveryApproval({
  policy,
  request,
  lastExecutedAtMs = 0,
  nowMs = Date.now(),
}: {
  policy?: RecoveryPolicy;
  request: ExecuteRecoveryActionRequest;
  lastExecutedAtMs?: number;
  nowMs?: number;
}): boolean {
  if (!policy) {
    return true;
  }

  if (request.level === 'L1_harmless' && policy.auto_execute) {
    return false;
  }

  if (request.level === 'L2_controlled') {
    if (nowMs - lastExecutedAtMs < policy.cooldown_seconds * 1000) {
      return true;
    }

    return !policy.auto_execute;
  }

  return true;
}

export function buildRecoveryActionEntity({
  actionId,
  request,
  scope,
  requiresApproval,
  now,
}: {
  actionId: string;
  request: ExecuteRecoveryActionRequest;
  scope: {
    tenant_id: string;
    project_id: string;
  };
  requiresApproval: boolean;
  now: string;
}): RecoveryAction {
  return {
    action_id: actionId,
    incident_id: request.incident_id,
    hypothesis_id: request.hypothesis_id,
    scope,
    level: request.level,
    type: request.type,
    status: requiresApproval ? 'pending_approval' : 'approved',
    safety: {
      requires_approval: requiresApproval,
      auto_rollback_on_failure: request.level !== 'L1_harmless',
      estimated_downtime_seconds: estimateRecoveryDowntime(request.type),
    },
    execution: {},
    created_at: now,
    updated_at: now,
  };
}

export function hasRecoveryActionScope(
  action: RecoveryAction,
  tenantId: string,
  projectId: string
) {
  return action.scope.tenant_id === tenantId && action.scope.project_id === projectId;
}

export function applyRecoveryActionStatusUpdate({
  action,
  newStatus,
  updatedAt,
  result,
  completedAt = updatedAt,
}: {
  action: RecoveryAction;
  newStatus: RecoveryActionStatus;
  updatedAt: string;
  result?: ExecutionResult;
  completedAt?: string;
}) {
  action.status = newStatus;
  action.updated_at = updatedAt;

  if (result) {
    action.execution.result = result;
    action.execution.completed_at = completedAt;
  }

  return action;
}

export function applyRecoveryActionStart(action: RecoveryAction, startedAt: string) {
  action.status = 'executing';
  action.execution.started_at = startedAt;
  action.updated_at = startedAt;
  return action;
}

export async function simulateRecoveryActionExecution(action: RecoveryAction): Promise<void> {
  const delayByType: Record<RecoveryAction['type'], number> = {
    restart: 25,
    rollback: 40,
    circuit_breaker: 15,
    feature_toggle: 20,
    code_patch: 60,
  };

  await new Promise((resolve) => setTimeout(resolve, delayByType[action.type] ?? 25));
}

export async function executeRecoveryActionSimulation({
  action,
  levelLabel,
  execute = simulateRecoveryActionExecution,
  now = Date.now,
}: {
  action: RecoveryAction;
  levelLabel: 'L1' | 'L2';
  execute?: (action: RecoveryAction) => Promise<void>;
  now?: () => number;
}): Promise<ExecutionResult> {
  const startTime = now();

  try {
    await execute(action);

    return {
      success: true,
      output: `${levelLabel} action ${action.type} completed successfully`,
      duration_ms: now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration_ms: now() - startTime,
    };
  }
}

export function buildRecoveryPolicyEntity({
  policyId,
  policy,
  now,
}: {
  policyId: string;
  policy: Omit<RecoveryPolicy, 'policy_id' | 'created_at' | 'updated_at'>;
  now: string;
}): RecoveryPolicy {
  return {
    ...policy,
    policy_id: policyId,
    created_at: now,
    updated_at: now,
  };
}
