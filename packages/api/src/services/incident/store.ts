/**
 * Incident 存储服务
 * Phase 1.1: Incident 数据模型与采集系统
 *
 * 当前使用内存存储，后续迁移到 PostgreSQL
 */

import type {
  Incident,
  IncidentQueryParams,
  IncidentListResponse,
  IncidentStatus,
  CreateIncidentRequest,
  IncidentScope,
} from '@los-ast/shared/types';
import { generateId } from '../../utils/id-generator.js';
import { incidentRepository } from '../../persistence/repositories/incident-repository.js';

/**
 * 生成指纹
 */
function generateFingerprint(scope: { tenant_id: string; project_id: string }, title: string): string {
  const data = `${scope.tenant_id}:${scope.project_id}:${title}:${Date.now()}`;
  return Buffer.from(data).toString('base64').substring(0, 16);
}

/**
 * 创建 Incident
 */
export async function createIncident(
  request: Omit<CreateIncidentRequest, 'scope'> & { scope: IncidentScope }
): Promise<Incident> {
  const now = new Date().toISOString();
  const incidentId = generateId('inc');

  const incident: Incident = {
    incident_id: incidentId,
    fingerprint: generateFingerprint(
      { tenant_id: request.scope.tenant_id, project_id: request.scope.project_id },
      request.title
    ),
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

  incidentRepository.set(incidentId, incident);

  console.log(`[IncidentStore] Created incident ${incidentId}: ${incident.title}`);

  return incident;
}

/**
 * 获取 Incident
 */
export async function getIncident(incidentId: string): Promise<Incident | null> {
  return incidentRepository.get(incidentId) || null;
}

export async function getIncidentWithScope(
  incidentId: string,
  tenant_id: string,
  project_id: string
): Promise<Incident | null> {
  const incident = incidentRepository.get(incidentId);
  if (!incident) {
    return null;
  }

  if (incident.scope.tenant_id !== tenant_id || incident.scope.project_id !== project_id) {
    return null;
  }

  return incident;
}

/**
 * 更新 Incident 状态
 */
export async function updateIncidentStatus(
  incidentId: string,
  newStatus: IncidentStatus,
  comment?: string,
  actorId?: string
): Promise<Incident | null> {
  const incident = incidentRepository.get(incidentId);
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

  incidentRepository.set(incidentId, incident);

  console.log(`[IncidentStore] Updated incident ${incidentId} status to ${newStatus}`);

  return incident;
}

/**
 * 添加假设到 Incident
 */
export async function addHypothesisToIncident(
  incidentId: string,
  hypothesisId: string
): Promise<Incident | null> {
  const incident = incidentRepository.get(incidentId);
  if (!incident) {
    return null;
  }

  if (!incident.hypotheses.includes(hypothesisId)) {
    incident.hypotheses.push(hypothesisId);
    incident.updated_at = new Date().toISOString();
    incident.version += 1;
    incidentRepository.set(incidentId, incident);
  }

  return incident;
}

/**
 * 添加恢复动作到 Incident
 */
export async function addRecoveryActionToIncident(
  incidentId: string,
  actionId: string
): Promise<Incident | null> {
  const incident = incidentRepository.get(incidentId);
  if (!incident) {
    return null;
  }

  if (!incident.recovery_actions.includes(actionId)) {
    incident.recovery_actions.push(actionId);
    incident.updated_at = new Date().toISOString();
    incident.version += 1;
    incidentRepository.set(incidentId, incident);
  }

  return incident;
}

/**
 * 查询 Incidents
 */
export async function queryIncidents(params: IncidentQueryParams): Promise<IncidentListResponse> {
  return incidentRepository.query(params);
}

/**
 * 获取所有 Incidents (用于调试)
 */
export function getAllIncidents(): Incident[] {
  return incidentRepository.values();
}

/**
 * 清空存储 (用于测试)
 */
export function clearStore(): void {
  incidentRepository.clear();
}

/**
 * 获取存储统计
 */
export function getStoreStats(): { count: number; byStatus: Record<string, number> } {
  return incidentRepository.getScopedStats();
}

export function getStoreStatsByScope(scope: {
  tenant_id?: string;
  project_id?: string;
}): { count: number; byStatus: Record<string, number> } {
  return incidentRepository.getScopedStats(scope);
}

/**
 * 添加时间线事件
 */
export async function addTimelineEvent(
  incidentId: string,
  type: string,
  description: string,
  actor?: string,
  metadata?: Record<string, unknown>
): Promise<Incident | null> {
  const incident = incidentRepository.get(incidentId);
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

  incidentRepository.set(incidentId, incident);

  return incident;
}
