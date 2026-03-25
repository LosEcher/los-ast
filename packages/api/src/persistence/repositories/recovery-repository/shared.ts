import type {
  RecoveryAction,
  RecoveryActionStatus,
  RecoveryActionType,
  RecoveryLevel,
  RecoveryPolicy,
  RecoveryStats,
} from '@los-ast/shared/types';

export interface RecoveryActionQueryParams {
  incident_id?: string;
  status?: RecoveryActionStatus;
  level?: string;
  limit?: number;
  offset?: number;
  scope?: {
    tenant_id?: string;
    project_id?: string;
  };
}

export interface RecoveryActionQueryResult {
  items: RecoveryAction[];
  total: number;
}

function matchesRecoveryScope(
  action: RecoveryAction,
  scope?: { tenant_id?: string; project_id?: string }
): boolean {
  if (!scope) {
    return true;
  }
  if (scope.tenant_id && action.scope.tenant_id !== scope.tenant_id) {
    return false;
  }
  if (scope.project_id && action.scope.project_id !== scope.project_id) {
    return false;
  }
  return true;
}

export function filterRecoveryActionsByQuery(
  items: RecoveryAction[],
  params: RecoveryActionQueryParams
): RecoveryAction[] {
  return items.filter((action) => {
    if (!matchesRecoveryScope(action, params.scope)) {
      return false;
    }
    if (params.incident_id && action.incident_id !== params.incident_id) {
      return false;
    }
    if (params.status && action.status !== params.status) {
      return false;
    }
    if (params.level && action.level !== params.level) {
      return false;
    }
    return true;
  });
}

export function sortRecoveryActionsByCreatedAtDesc(items: RecoveryAction[]): RecoveryAction[] {
  return [...items].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  );
}

export function paginateRecoveryActionItems(
  items: RecoveryAction[],
  params: RecoveryActionQueryParams
): RecoveryActionQueryResult {
  const total = items.length;
  const offset = params.offset || 0;
  const limit = params.limit || 20;
  return {
    items: items.slice(offset, offset + limit),
    total,
  };
}

export function queryRecoveryActionItems(
  items: RecoveryAction[],
  params: RecoveryActionQueryParams
): RecoveryActionQueryResult {
  return paginateRecoveryActionItems(
    sortRecoveryActionsByCreatedAtDesc(filterRecoveryActionsByQuery(items, params)),
    params
  );
}

export function buildRecoveryActionWhereClause(params: RecoveryActionQueryParams): {
  whereClause: string;
  values: Array<string | number>;
} {
  const conditions: string[] = [];
  const values: Array<string | number> = [];

  if (params.scope?.tenant_id && params.scope?.project_id) {
    conditions.push('tenant_id = ?', 'project_id = ?');
    values.push(params.scope.tenant_id, params.scope.project_id);
  }

  if (params.incident_id) {
    conditions.push('incident_id = ?');
    values.push(params.incident_id);
  }

  if (params.status) {
    conditions.push('status = ?');
    values.push(params.status);
  }

  if (params.level) {
    conditions.push('level = ?');
    values.push(params.level);
  }

  return {
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
  };
}

export function buildRecoveryStats(
  sourceActions: RecoveryAction[],
  scope?: { tenant_id?: string; project_id?: string }
): RecoveryStats {
  const actions = scope
    ? sourceActions.filter((action) => matchesRecoveryScope(action, scope))
    : sourceActions;

  const byLevel: Record<RecoveryLevel, number> = {
    L1_harmless: 0,
    L2_controlled: 0,
    L3_code_level: 0,
  };
  const byStatus: Record<RecoveryActionStatus, number> = {
    pending_approval: 0,
    approved: 0,
    executing: 0,
    succeeded: 0,
    failed: 0,
    rolled_back: 0,
  };
  const byType: Record<RecoveryActionType, number> = {
    restart: 0,
    rollback: 0,
    circuit_breaker: 0,
    feature_toggle: 0,
    code_patch: 0,
  };
  let completedCount = 0;
  let succeededCount = 0;
  let totalExecutionTimeMs = 0;

  for (const action of actions) {
    byLevel[action.level] += 1;
    byStatus[action.status] += 1;
    byType[action.type] += 1;

    if (action.execution.result) {
      completedCount += 1;
      totalExecutionTimeMs += action.execution.result.duration_ms;
      if (action.status === 'succeeded') {
        succeededCount += 1;
      }
    }
  }

  return {
    total_actions: actions.length,
    by_level: byLevel,
    by_status: byStatus,
    by_type: byType,
    success_rate: completedCount > 0 ? succeededCount / completedCount : 0,
    avg_execution_time_ms: completedCount > 0 ? totalExecutionTimeMs / completedCount : 0,
  };
}

export function parseStoredRecoveryAction(
  rawValue: string | undefined,
  actionId: string
): RecoveryAction | undefined {
  if (!rawValue) {
    return undefined;
  }

  try {
    return JSON.parse(rawValue) as RecoveryAction;
  } catch (error) {
    console.warn(
      `[Persistence] Ignoring invalid recovery action payload for "${actionId}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return undefined;
  }
}

export function parseStoredRecoveryPolicy(
  rawValue: string | undefined,
  policyId: string
): RecoveryPolicy | undefined {
  if (!rawValue) {
    return undefined;
  }

  try {
    return JSON.parse(rawValue) as RecoveryPolicy;
  } catch (error) {
    console.warn(
      `[Persistence] Ignoring invalid recovery policy payload for "${policyId}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return undefined;
  }
}
