import { describe, expect, it, vi } from 'vitest';
import type { RecoveryAction, RecoveryPolicy } from '@los-ast/shared/types';
import {
  buildRecoveryActionWhereClause,
  buildRecoveryStats,
  parseStoredRecoveryAction,
  parseStoredRecoveryPolicy,
  queryRecoveryActionItems,
} from '../../../src/persistence/repositories/recovery-repository/shared';

function buildRecoveryAction(overrides: Partial<RecoveryAction> = {}): RecoveryAction {
  return {
    action_id: 'act-1',
    incident_id: 'inc-1',
    hypothesis_id: 'hyp-1',
    scope: {
      tenant_id: 'tenant-a',
      project_id: 'project-a',
    },
    level: 'L1_harmless',
    type: 'restart',
    status: 'pending_approval',
    safety: {
      requires_approval: true,
      auto_rollback_on_failure: false,
      estimated_downtime_seconds: 10,
    },
    execution: {},
    created_at: '2026-03-25T00:00:00.000Z',
    updated_at: '2026-03-25T00:00:00.000Z',
    ...overrides,
  };
}

describe('recovery repository shared helpers', () => {
  it('queries recovery actions by scope and filters with newest first ordering', () => {
    const result = queryRecoveryActionItems([
      buildRecoveryAction({ action_id: 'act-old', created_at: '2026-03-25T00:00:00.000Z' }),
      buildRecoveryAction({
        action_id: 'act-new',
        created_at: '2026-03-25T00:05:00.000Z',
        incident_id: 'inc-2',
        status: 'succeeded',
      }),
      buildRecoveryAction({
        action_id: 'act-other-scope',
        scope: { tenant_id: 'tenant-b', project_id: 'project-b' },
      }),
    ], {
      scope: { tenant_id: 'tenant-a', project_id: 'project-a' },
      limit: 1,
    });

    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.action_id)).toEqual(['act-new']);
  });

  it('builds sqlite where clauses and scoped recovery stats', () => {
    expect(buildRecoveryActionWhereClause({
      scope: { tenant_id: 'tenant-a', project_id: 'project-a' },
      incident_id: 'inc-1',
      status: 'pending_approval',
      level: 'L1_harmless',
    })).toEqual({
      whereClause: 'WHERE tenant_id = ? AND project_id = ? AND incident_id = ? AND status = ? AND level = ?',
      values: ['tenant-a', 'project-a', 'inc-1', 'pending_approval', 'L1_harmless'],
    });

    const stats = buildRecoveryStats([
      buildRecoveryAction(),
      buildRecoveryAction({
        action_id: 'act-2',
        status: 'succeeded',
        type: 'rollback',
        level: 'L2_controlled',
        execution: {
          result: {
            success: true,
            duration_ms: 1200,
          },
        },
      }),
    ], { tenant_id: 'tenant-a', project_id: 'project-a' });

    expect(stats).toMatchObject({
      total_actions: 2,
      by_level: {
        L1_harmless: 1,
        L2_controlled: 1,
      },
      by_status: {
        pending_approval: 1,
        succeeded: 1,
      },
      by_type: {
        restart: 1,
        rollback: 1,
      },
      success_rate: 1,
      avg_execution_time_ms: 1200,
    });
  });

  it('ignores invalid stored recovery payloads', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const policy: RecoveryPolicy = {
      policy_id: 'pol-1',
      name: 'Policy',
      level: 'L1_harmless',
      auto_execute: false,
      allowed_actions: ['restart'],
      cooldown_seconds: 60,
      created_at: '2026-03-25T00:00:00.000Z',
      updated_at: '2026-03-25T00:00:00.000Z',
    };

    expect(parseStoredRecoveryAction(JSON.stringify(buildRecoveryAction()), 'act-1')?.action_id).toBe('act-1');
    expect(parseStoredRecoveryPolicy(JSON.stringify(policy), 'pol-1')?.policy_id).toBe('pol-1');
    expect(parseStoredRecoveryAction('{', 'act-bad')).toBeUndefined();
    expect(parseStoredRecoveryPolicy('{', 'pol-bad')).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });
});
