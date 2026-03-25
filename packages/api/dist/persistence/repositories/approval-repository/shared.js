export function assertApprovalScope(params) {
    if (!params.tenant_id || !params.project_id) {
        throw new Error('tenant_id and project_id are required for queryApprovals');
    }
}
export function filterApprovalsByQuery(items, params) {
    assertApprovalScope(params);
    return items.filter((approval) => {
        if (approval.scope.tenant_id !== params.tenant_id ||
            approval.scope.project_id !== params.project_id) {
            return false;
        }
        if (params.status && approval.status !== params.status) {
            return false;
        }
        if (params.risk_level && approval.risk_level !== params.risk_level) {
            return false;
        }
        if (params.item_type && approval.item_type !== params.item_type) {
            return false;
        }
        return true;
    });
}
export function sortApprovalsByCreatedAtDesc(items) {
    return [...items].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
}
export function paginateApprovalItems(items, params) {
    const total = items.length;
    const offset = params.offset || 0;
    const limit = params.limit || 20;
    const pagedItems = items.slice(offset, offset + limit);
    return {
        items: pagedItems,
        total,
        has_more: offset + limit < total,
        next_offset: offset + limit < total ? offset + limit : undefined,
    };
}
export function queryApprovalItems(items, params) {
    return paginateApprovalItems(sortApprovalsByCreatedAtDesc(filterApprovalsByQuery(items, params)), params);
}
export function createBaseApprovalStats() {
    return {
        total: 0,
        by_status: {
            pending: 0,
            approved: 0,
            rejected: 0,
            expired: 0,
        },
        by_risk_level: {},
        by_type: {
            recovery_action: 0,
            code_patch: 0,
            config_change: 0,
            recipe_activation: 0,
        },
        avg_decision_time_seconds: 0,
    };
}
export function buildApprovalStats(items, tenantId, projectId) {
    const stats = createBaseApprovalStats();
    let totalDecisionTimeSeconds = 0;
    let decisionCount = 0;
    for (const approval of items) {
        if (approval.scope.tenant_id !== tenantId || approval.scope.project_id !== projectId) {
            continue;
        }
        stats.total += 1;
        stats.by_status[approval.status] += 1;
        stats.by_risk_level[approval.risk_level] = (stats.by_risk_level[approval.risk_level] || 0) + 1;
        stats.by_type[approval.item_type] += 1;
        if (approval.approver) {
            totalDecisionTimeSeconds += Math.max(0, Math.round((new Date(approval.approver.timestamp).getTime() - new Date(approval.requester.timestamp).getTime()) / 1000));
            decisionCount += 1;
        }
    }
    stats.avg_decision_time_seconds = decisionCount > 0 ? totalDecisionTimeSeconds / decisionCount : 0;
    return stats;
}
export function listExpiredPendingApprovalEntries(entries, referenceTime) {
    return entries.filter(([, approval]) => approval.status === 'pending' && approval.timeout_at < referenceTime);
}
export function parseStoredApproval(rawValue, approvalId) {
    if (!rawValue) {
        return undefined;
    }
    try {
        return JSON.parse(rawValue);
    }
    catch (error) {
        console.warn(`[Persistence] Ignoring invalid approval payload for "${approvalId}": ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
    }
}
export function buildApprovalWhereClause(params) {
    assertApprovalScope(params);
    const conditions = ['tenant_id = ?', 'project_id = ?'];
    const values = [params.tenant_id, params.project_id];
    if (params.status) {
        conditions.push('status = ?');
        values.push(params.status);
    }
    if (params.risk_level) {
        conditions.push('risk_level = ?');
        values.push(params.risk_level);
    }
    if (params.item_type) {
        conditions.push('item_type = ?');
        values.push(params.item_type);
    }
    return {
        whereClause: `WHERE ${conditions.join(' AND ')}`,
        values,
    };
}
