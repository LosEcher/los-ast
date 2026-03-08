/**
 * Incident 存储服务
 * Phase 1.1: Incident 数据模型与采集系统
 *
 * 当前使用内存存储，后续迁移到 PostgreSQL
 */
import { generateId } from '../../utils/id-generator.js';
// 内存存储 - 后续替换为数据库
const incidentStore = new Map();
/**
 * 生成指纹
 */
function generateFingerprint(scope, title) {
    const data = `${scope.tenant_id}:${scope.project_id}:${title}:${Date.now()}`;
    return Buffer.from(data).toString('base64').substring(0, 16);
}
/**
 * 创建 Incident
 */
export async function createIncident(request) {
    const now = new Date().toISOString();
    const incidentId = generateId('inc');
    const incident = {
        incident_id: incidentId,
        fingerprint: generateFingerprint({ tenant_id: request.scope.tenant_id, project_id: request.scope.project_id }, request.title),
        scope: request.scope,
        title: request.title,
        description: request.description,
        severity: request.severity,
        status: 'detected',
        source: request.source,
        timeline: [
            {
                timestamp: now,
                type: 'created',
                description: `Incident created from ${request.source.type}`,
                metadata: { source: request.source },
            },
        ],
        hypotheses: [],
        recovery_actions: [],
        impact: {
            services_affected: request.impact?.services_affected || [],
            users_impacted: request.impact?.users_impacted,
            sla_breach_risk: request.impact?.sla_breach_risk || false,
        },
        created_at: now,
        updated_at: now,
        version: 1,
    };
    incidentStore.set(incidentId, incident);
    console.log(`[IncidentStore] Created incident ${incidentId}: ${incident.title}`);
    return incident;
}
/**
 * 获取 Incident
 */
export async function getIncident(incidentId) {
    return incidentStore.get(incidentId) || null;
}
/**
 * 更新 Incident 状态
 */
export async function updateIncidentStatus(incidentId, newStatus, comment, actorId) {
    const incident = incidentStore.get(incidentId);
    if (!incident) {
        return null;
    }
    const now = new Date().toISOString();
    // 添加状态变更事件到时间线
    incident.timeline.push({
        timestamp: now,
        type: 'status_change',
        description: comment || `Status changed to ${newStatus}`,
        actor: actorId,
        metadata: { from: incident.status, to: newStatus },
    });
    incident.status = newStatus;
    incident.updated_at = now;
    incident.version += 1;
    incidentStore.set(incidentId, incident);
    console.log(`[IncidentStore] Updated incident ${incidentId} status to ${newStatus}`);
    return incident;
}
/**
 * 添加假设到 Incident
 */
export async function addHypothesisToIncident(incidentId, hypothesisId) {
    const incident = incidentStore.get(incidentId);
    if (!incident) {
        return null;
    }
    if (!incident.hypotheses.includes(hypothesisId)) {
        incident.hypotheses.push(hypothesisId);
        incident.updated_at = new Date().toISOString();
        incident.version += 1;
        incidentStore.set(incidentId, incident);
    }
    return incident;
}
/**
 * 添加恢复动作到 Incident
 */
export async function addRecoveryActionToIncident(incidentId, actionId) {
    const incident = incidentStore.get(incidentId);
    if (!incident) {
        return null;
    }
    if (!incident.recovery_actions.includes(actionId)) {
        incident.recovery_actions.push(actionId);
        incident.updated_at = new Date().toISOString();
        incident.version += 1;
        incidentStore.set(incidentId, incident);
    }
    return incident;
}
/**
 * 查询 Incidents
 */
export async function queryIncidents(params) {
    let items = Array.from(incidentStore.values());
    // 应用过滤器
    if (params.tenant_id) {
        items = items.filter((i) => i.scope.tenant_id === params.tenant_id);
    }
    if (params.project_id) {
        items = items.filter((i) => i.scope.project_id === params.project_id);
    }
    if (params.status) {
        items = items.filter((i) => i.status === params.status);
    }
    if (params.severity) {
        items = items.filter((i) => i.severity === params.severity);
    }
    if (params.source_type) {
        items = items.filter((i) => i.source.type === params.source_type);
    }
    if (params.from) {
        items = items.filter((i) => i.created_at >= params.from);
    }
    if (params.to) {
        items = items.filter((i) => i.created_at <= params.to);
    }
    // 按创建时间降序
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const total = items.length;
    const offset = params.offset || 0;
    const limit = params.limit || 20;
    items = items.slice(offset, offset + limit);
    return {
        items,
        total,
        has_more: offset + limit < total,
        next_offset: offset + limit < total ? offset + limit : undefined,
    };
}
/**
 * 获取所有 Incidents (用于调试)
 */
export function getAllIncidents() {
    return Array.from(incidentStore.values());
}
/**
 * 清空存储 (用于测试)
 */
export function clearStore() {
    incidentStore.clear();
}
/**
 * 获取存储统计
 */
export function getStoreStats() {
    const items = Array.from(incidentStore.values());
    const byStatus = {};
    for (const incident of items) {
        byStatus[incident.status] = (byStatus[incident.status] || 0) + 1;
    }
    return {
        count: items.length,
        byStatus,
    };
}
export function getStoreStatsByScope(scope) {
    const items = Array.from(incidentStore.values()).filter((incident) => {
        if (scope.tenant_id && incident.scope.tenant_id !== scope.tenant_id) {
            return false;
        }
        if (scope.project_id && incident.scope.project_id !== scope.project_id) {
            return false;
        }
        return true;
    });
    const byStatus = {};
    for (const incident of items) {
        byStatus[incident.status] = (byStatus[incident.status] || 0) + 1;
    }
    return {
        count: items.length,
        byStatus,
    };
}
/**
 * 添加时间线事件
 */
export async function addTimelineEvent(incidentId, type, description, actor, metadata) {
    const incident = incidentStore.get(incidentId);
    if (!incident) {
        return null;
    }
    incident.timeline.push({
        timestamp: new Date().toISOString(),
        type,
        description,
        actor,
        metadata,
    });
    incident.updated_at = new Date().toISOString();
    incident.version += 1;
    incidentStore.set(incidentId, incident);
    return incident;
}
//# sourceMappingURL=store.js.map