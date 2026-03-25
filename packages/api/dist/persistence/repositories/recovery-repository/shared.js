function matchesRecoveryScope(action, scope) {
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
export function filterRecoveryActionsByQuery(items, params) {
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
export function sortRecoveryActionsByCreatedAtDesc(items) {
    return [...items].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
}
export function paginateRecoveryActionItems(items, params) {
    const total = items.length;
    const offset = params.offset || 0;
    const limit = params.limit || 20;
    return {
        items: items.slice(offset, offset + limit),
        total,
    };
}
export function queryRecoveryActionItems(items, params) {
    return paginateRecoveryActionItems(sortRecoveryActionsByCreatedAtDesc(filterRecoveryActionsByQuery(items, params)), params);
}
export function buildRecoveryActionWhereClause(params) {
    const conditions = [];
    const values = [];
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
export function buildRecoveryStats(sourceActions, scope) {
    const actions = scope
        ? sourceActions.filter((action) => matchesRecoveryScope(action, scope))
        : sourceActions;
    const byLevel = {
        L1_harmless: 0,
        L2_controlled: 0,
        L3_code_level: 0,
    };
    const byStatus = {
        pending_approval: 0,
        approved: 0,
        executing: 0,
        succeeded: 0,
        failed: 0,
        rolled_back: 0,
    };
    const byType = {
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
export function parseStoredRecoveryAction(rawValue, actionId) {
    if (!rawValue) {
        return undefined;
    }
    try {
        return JSON.parse(rawValue);
    }
    catch (error) {
        console.warn(`[Persistence] Ignoring invalid recovery action payload for "${actionId}": ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
    }
}
export function parseStoredRecoveryPolicy(rawValue, policyId) {
    if (!rawValue) {
        return undefined;
    }
    try {
        return JSON.parse(rawValue);
    }
    catch (error) {
        console.warn(`[Persistence] Ignoring invalid recovery policy payload for "${policyId}": ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
    }
}
