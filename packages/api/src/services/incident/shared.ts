import type {
  CreateIncidentRequest,
  Incident,
  IncidentEvent,
  IncidentScope,
  IncidentStatus,
} from '@los-ast/shared/types';

export function generateIncidentFingerprint(
  scope: { tenant_id: string; project_id: string },
  title: string,
  nowMs = Date.now()
) {
  const data = `${scope.tenant_id}:${scope.project_id}:${title}:${nowMs}`;
  return Buffer.from(data).toString('base64').substring(0, 16);
}

export function buildIncidentEntity({
  incidentId,
  request,
  now,
  fingerprint,
}: {
  incidentId: string;
  request: Omit<CreateIncidentRequest, 'scope'> & { scope: IncidentScope };
  now: string;
  fingerprint: string;
}): Incident {
  return {
    incident_id: incidentId,
    fingerprint,
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
}

export function hasIncidentScope(
  incident: Incident,
  tenantId: string,
  projectId: string
) {
  return incident.scope.tenant_id === tenantId && incident.scope.project_id === projectId;
}

export function applyIncidentStatusUpdate({
  incident,
  newStatus,
  now,
  comment,
  actorId,
}: {
  incident: Incident;
  newStatus: IncidentStatus;
  now: string;
  comment?: string;
  actorId?: string;
}) {
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
  return incident;
}

export function appendUniqueIncidentReference({
  incident,
  field,
  value,
  now,
}: {
  incident: Incident;
  field: 'hypotheses' | 'recovery_actions';
  value: string;
  now: string;
}) {
  if (incident[field].includes(value)) {
    return incident;
  }

  incident[field].push(value);
  incident.updated_at = now;
  incident.version += 1;
  return incident;
}

export function appendIncidentTimelineEvent({
  incident,
  event,
  now,
}: {
  incident: Incident;
  event: Omit<IncidentEvent, 'timestamp'>;
  now: string;
}) {
  incident.timeline.push({
    timestamp: now,
    ...event,
  });
  incident.updated_at = now;
  incident.version += 1;
  return incident;
}
