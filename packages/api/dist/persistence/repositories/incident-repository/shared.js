export const incidentMigrations = [
    {
        version: 1,
        up(database) {
            database.exec(`
        CREATE TABLE IF NOT EXISTS incidents (
          incident_id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          project_id TEXT NOT NULL,
          status TEXT NOT NULL,
          severity TEXT NOT NULL,
          source_type TEXT NOT NULL,
          fingerprint TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          payload_json TEXT NOT NULL
        ) STRICT
      `);
            database.exec(`
        CREATE INDEX IF NOT EXISTS incidents_scope_created_idx
        ON incidents (tenant_id, project_id, created_at DESC)
      `);
            database.exec(`
        CREATE INDEX IF NOT EXISTS incidents_scope_status_idx
        ON incidents (tenant_id, project_id, status)
      `);
            database.exec(`
        CREATE INDEX IF NOT EXISTS incidents_scope_severity_idx
        ON incidents (tenant_id, project_id, severity)
      `);
        },
    },
];
export function filterIncidentsByQuery(items, params) {
    return items.filter((incident) => {
        if (params.tenant_id && incident.scope.tenant_id !== params.tenant_id) {
            return false;
        }
        if (params.project_id && incident.scope.project_id !== params.project_id) {
            return false;
        }
        if (params.status && incident.status !== params.status) {
            return false;
        }
        if (params.severity && incident.severity !== params.severity) {
            return false;
        }
        if (params.source_type && incident.source.type !== params.source_type) {
            return false;
        }
        if (params.from && incident.created_at < params.from) {
            return false;
        }
        if (params.to && incident.created_at > params.to) {
            return false;
        }
        return true;
    });
}
export function sortIncidentsByCreatedAtDesc(items) {
    return [...items].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
}
export function paginateIncidentItems(items, params) {
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
export function queryIncidentItems(items, params) {
    return paginateIncidentItems(sortIncidentsByCreatedAtDesc(filterIncidentsByQuery(items, params)), params);
}
export function buildIncidentWhereClause(params) {
    const conditions = [];
    const values = [];
    if (params.tenant_id) {
        conditions.push('tenant_id = ?');
        values.push(params.tenant_id);
    }
    if (params.project_id) {
        conditions.push('project_id = ?');
        values.push(params.project_id);
    }
    if (params.status) {
        conditions.push('status = ?');
        values.push(params.status);
    }
    if (params.severity) {
        conditions.push('severity = ?');
        values.push(params.severity);
    }
    if (params.source_type) {
        conditions.push('source_type = ?');
        values.push(params.source_type);
    }
    if (params.from) {
        conditions.push('created_at >= ?');
        values.push(params.from);
    }
    if (params.to) {
        conditions.push('created_at <= ?');
        values.push(params.to);
    }
    return {
        whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
        values,
    };
}
export function buildIncidentScopedStats(items, scope = {}) {
    const filtered = items.filter((incident) => {
        if (scope.tenant_id && incident.scope.tenant_id !== scope.tenant_id) {
            return false;
        }
        if (scope.project_id && incident.scope.project_id !== scope.project_id) {
            return false;
        }
        return true;
    });
    const byStatus = {};
    for (const incident of filtered) {
        byStatus[incident.status] = (byStatus[incident.status] || 0) + 1;
    }
    return {
        count: filtered.length,
        byStatus,
    };
}
export function buildIncidentStatusCounts(rows) {
    const byStatus = {};
    let count = 0;
    for (const row of rows) {
        const statusCount = typeof row.count === 'bigint' ? Number(row.count) : row.count;
        byStatus[row.status] = statusCount;
        count += statusCount;
    }
    return {
        count,
        byStatus,
    };
}
export function parseStoredIncident(rawValue, incidentId) {
    if (!rawValue) {
        return undefined;
    }
    try {
        return JSON.parse(rawValue);
    }
    catch (error) {
        console.warn(`[Persistence] Ignoring invalid incident payload for "${incidentId}": ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
    }
}
