import { describe, expect, it } from 'vitest';

import type { Incident, IncidentScope } from '@los-ast/shared/types';
import {
  appendIncidentTimelineEvent,
  appendUniqueIncidentReference,
  applyIncidentStatusUpdate,
  buildIncidentEntity,
  generateIncidentFingerprint,
  hasIncidentScope,
} from '../../../src/services/incident/shared.js';

function makeScope(): IncidentScope {
  return {
    tenant_id: 'tenant-a',
    project_id: 'project-a',
    actor_id: 'actor-a',
    trace_id: 'trace-a',
  };
}

function makeIncident(): Incident {
  return buildIncidentEntity({
    incidentId: 'inc-1',
    now: '2026-03-25T00:00:00.000Z',
    fingerprint: 'fingerprint-1',
    request: {
      scope: makeScope(),
      title: 'Database latency spike',
      description: 'Latency increased',
      severity: 'high',
      source: {
        type: 'metric_alert',
        detector_id: 'detector-1',
        raw_payload: { latency: 1000 },
      },
      impact: {
        services_affected: ['api'],
        users_impacted: 120,
        sla_breach_risk: true,
      },
    },
  });
}

describe('incident store shared helpers', () => {
  it('builds deterministic fingerprints and incident entities from stable inputs', () => {
    expect(generateIncidentFingerprint(
      { tenant_id: 'tenant-a', project_id: 'project-a' },
      'Database latency spike',
      100
    )).toBe(generateIncidentFingerprint(
      { tenant_id: 'tenant-a', project_id: 'project-a' },
      'Database latency spike',
      100
    ));

    const incident = makeIncident();
    expect(incident).toMatchObject({
      incident_id: 'inc-1',
      status: 'detected',
      version: 1,
      impact: {
        services_affected: ['api'],
        users_impacted: 120,
        sla_breach_risk: true,
      },
    });
    expect(incident.timeline[0]?.type).toBe('created');
  });

  it('applies scoped checks and status transitions without losing timeline metadata', () => {
    const incident = makeIncident();
    expect(hasIncidentScope(incident, 'tenant-a', 'project-a')).toBe(true);
    expect(hasIncidentScope(incident, 'tenant-b', 'project-a')).toBe(false);

    applyIncidentStatusUpdate({
      incident,
      newStatus: 'triaging',
      now: '2026-03-25T00:10:00.000Z',
      comment: 'Investigating latency',
      actorId: 'operator-1',
    });

    expect(incident.status).toBe('triaging');
    expect(incident.version).toBe(2);
    expect(incident.timeline.at(-1)).toMatchObject({
      type: 'status_change',
      description: 'Investigating latency',
      actor: 'operator-1',
      metadata: { from: 'detected', to: 'triaging' },
    });
  });

  it('deduplicates references and appends timeline events consistently', () => {
    const incident = makeIncident();

    appendUniqueIncidentReference({
      incident,
      field: 'hypotheses',
      value: 'hyp-1',
      now: '2026-03-25T00:05:00.000Z',
    });
    appendUniqueIncidentReference({
      incident,
      field: 'hypotheses',
      value: 'hyp-1',
      now: '2026-03-25T00:06:00.000Z',
    });
    appendUniqueIncidentReference({
      incident,
      field: 'recovery_actions',
      value: 'act-1',
      now: '2026-03-25T00:07:00.000Z',
    });
    appendIncidentTimelineEvent({
      incident,
      now: '2026-03-25T00:08:00.000Z',
      event: {
        type: 'note',
        description: 'Operator attached diagnostics',
        actor: 'operator-2',
        metadata: { attached: true },
      },
    });

    expect(incident.hypotheses).toEqual(['hyp-1']);
    expect(incident.recovery_actions).toEqual(['act-1']);
    expect(incident.timeline.at(-1)).toMatchObject({
      type: 'note',
      description: 'Operator attached diagnostics',
      actor: 'operator-2',
    });
    expect(incident.version).toBe(4);
  });
});
