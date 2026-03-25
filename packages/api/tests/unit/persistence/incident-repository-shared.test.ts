import { describe, expect, it } from 'vitest';

import type { Incident } from '@los-ast/shared/types';
import {
  buildIncidentScopedStats,
  buildIncidentStatusCounts,
  buildIncidentWhereClause,
  parseStoredIncident,
  queryIncidentItems,
} from '../../../src/persistence/repositories/incident-repository/shared.js';

function makeIncident(overrides: Partial<Incident> = {}): Incident {
  return {
    incident_id: overrides.incident_id ?? 'inc-1',
    title: overrides.title ?? 'Incident',
    summary: overrides.summary ?? 'Summary',
    severity: overrides.severity ?? 'high',
    status: overrides.status ?? 'open',
    fingerprint: overrides.fingerprint ?? 'fp-1',
    source: overrides.source ?? { type: 'detector', signal: 'alert' },
    scope: overrides.scope ?? { tenant_id: 'tenant-a', project_id: 'project-a' },
    created_at: overrides.created_at ?? '2026-03-25T00:00:00.000Z',
    updated_at: overrides.updated_at ?? '2026-03-25T00:00:00.000Z',
    timeline: overrides.timeline ?? [],
    tags: overrides.tags ?? [],
    evidence: overrides.evidence ?? [],
    attribution: overrides.attribution ?? [],
    lessons: overrides.lessons ?? [],
    recovery_actions: overrides.recovery_actions ?? [],
  };
}

describe('incident repository shared helpers', () => {
  it('filters, sorts, and paginates incidents consistently for in-memory queries', () => {
    const items = queryIncidentItems(
      [
        makeIncident({ incident_id: 'inc-1', created_at: '2026-03-24T00:00:00.000Z' }),
        makeIncident({
          incident_id: 'inc-2',
          created_at: '2026-03-25T00:00:00.000Z',
          status: 'investigating',
          severity: 'critical',
        }),
      ],
      { tenant_id: 'tenant-a', project_id: 'project-a', limit: 1, offset: 0 }
    );

    expect(items.total).toBe(2);
    expect(items.has_more).toBe(true);
    expect(items.next_offset).toBe(1);
    expect(items.items[0]?.incident_id).toBe('inc-2');
  });

  it('builds sqlite where clauses and scoped status stats conservatively', () => {
    expect(buildIncidentWhereClause({
      tenant_id: 'tenant-a',
      project_id: 'project-a',
      status: 'open',
      severity: 'high',
      source_type: 'detector',
      from: '2026-03-01T00:00:00.000Z',
      to: '2026-03-31T23:59:59.000Z',
    })).toEqual({
      whereClause: 'WHERE tenant_id = ? AND project_id = ? AND status = ? AND severity = ? AND source_type = ? AND created_at >= ? AND created_at <= ?',
      values: [
        'tenant-a',
        'project-a',
        'open',
        'high',
        'detector',
        '2026-03-01T00:00:00.000Z',
        '2026-03-31T23:59:59.000Z',
      ],
    });

    expect(buildIncidentScopedStats([
      makeIncident({ status: 'open' }),
      makeIncident({ incident_id: 'inc-2', status: 'investigating' }),
      makeIncident({ incident_id: 'inc-3', scope: { tenant_id: 'tenant-b', project_id: 'project-b' } }),
    ], { tenant_id: 'tenant-a', project_id: 'project-a' })).toEqual({
      count: 2,
      byStatus: {
        open: 1,
        investigating: 1,
      },
    });

    expect(buildIncidentStatusCounts([
      { status: 'open', count: 2n },
      { status: 'resolved', count: 1 },
    ])).toEqual({
      count: 3,
      byStatus: {
        open: 2,
        resolved: 1,
      },
    });
  });

  it('parses stored incident payloads and ignores invalid rows without throwing', () => {
    const incident = makeIncident();
    expect(parseStoredIncident(JSON.stringify(incident), incident.incident_id)).toEqual(incident);
    expect(parseStoredIncident(undefined, 'inc-missing')).toBeUndefined();
    expect(parseStoredIncident('{bad-json', 'inc-bad')).toBeUndefined();
  });
});
