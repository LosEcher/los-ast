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
import {
  appendIncidentTimelineEvent,
  appendUniqueIncidentReference,
  applyIncidentStatusUpdate,
  buildIncidentEntity,
  generateIncidentFingerprint,
  hasIncidentScope,
} from './shared.js';

/**
 * 创建 Incident
 */
export async function createIncident(
  request: Omit<CreateIncidentRequest, 'scope'> & { scope: IncidentScope }
): Promise<Incident> {
  const now = new Date().toISOString();
  const incidentId = generateId('inc');
  const incident = buildIncidentEntity({
    incidentId,
    request,
    now,
    fingerprint: generateIncidentFingerprint(
      { tenant_id: request.scope.tenant_id, project_id: request.scope.project_id },
      request.title
    ),
  });

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

  if (!hasIncidentScope(incident, tenant_id, project_id)) {
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
  applyIncidentStatusUpdate({ incident, newStatus, now, comment, actorId });

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

  appendUniqueIncidentReference({
    incident,
    field: 'hypotheses',
    value: hypothesisId,
    now: new Date().toISOString(),
  });
  incidentRepository.set(incidentId, incident);

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

  appendUniqueIncidentReference({
    incident,
    field: 'recovery_actions',
    value: actionId,
    now: new Date().toISOString(),
  });
  incidentRepository.set(incidentId, incident);

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

  appendIncidentTimelineEvent({
    incident,
    now: new Date().toISOString(),
    event: {
      type,
      description,
      actor,
      metadata,
    },
  });

  incidentRepository.set(incidentId, incident);

  return incident;
}
