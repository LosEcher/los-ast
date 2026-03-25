import { describe, expect, it } from 'vitest';

import type {
  ExecuteRecoveryActionRequest,
  RecoveryAction,
  RecoveryPolicy,
} from '@los-ast/shared/types';
import {
  applyRecoveryActionStart,
  applyRecoveryActionStatusUpdate,
  buildRecoveryActionEntity,
  buildRecoveryPolicyEntity,
  estimateRecoveryDowntime,
  executeRecoveryActionSimulation,
  getRecoveryCooldownKey,
  hasRecoveryActionScope,
  shouldRequireRecoveryApproval,
} from '../../../src/services/recovery/shared.js';

function makeRequest(
  overrides: Partial<ExecuteRecoveryActionRequest> = {}
): ExecuteRecoveryActionRequest {
  return {
    incident_id: 'inc-1',
    hypothesis_id: 'hyp-1',
    level: 'L2_controlled',
    type: 'restart',
    parameters: {},
    actor_id: 'actor-1',
    ...overrides,
  };
}

function makePolicy(
  overrides: Partial<RecoveryPolicy> = {}
): RecoveryPolicy {
  return {
    policy_id: 'pol-1',
    name: 'Default L2',
    level: 'L2_controlled',
    auto_execute: true,
    allowed_actions: ['restart', 'rollback'],
    cooldown_seconds: 60,
    created_at: '2026-03-25T00:00:00.000Z',
    updated_at: '2026-03-25T00:00:00.000Z',
    ...overrides,
  };
}

function makeAction(
  overrides: Partial<RecoveryAction> = {}
): RecoveryAction {
  const action = buildRecoveryActionEntity({
    actionId: 'act-1',
    request: makeRequest(),
    scope: {
      tenant_id: 'tenant-a',
      project_id: 'project-a',
    },
    requiresApproval: true,
    now: '2026-03-25T00:00:00.000Z',
  });

  return {
    ...action,
    ...overrides,
    scope: overrides.scope ?? action.scope,
    safety: overrides.safety ?? action.safety,
    execution: overrides.execution ?? action.execution,
  };
}

describe('recovery store shared helpers', () => {
  it('derives cooldown keys, downtime estimates, and approval decisions conservatively', () => {
    expect(getRecoveryCooldownKey('inc-1', 'restart')).toBe('inc-1:restart');
    expect(estimateRecoveryDowntime('restart')).toBe(30);
    expect(estimateRecoveryDowntime('code_patch')).toBe(300);

    expect(shouldRequireRecoveryApproval({
      policy: undefined,
      request: makeRequest({ level: 'L1_harmless', type: 'restart' }),
    })).toBe(true);

    expect(shouldRequireRecoveryApproval({
      policy: makePolicy({
        level: 'L1_harmless',
        auto_execute: true,
        allowed_actions: ['restart'],
      }),
      request: makeRequest({ level: 'L1_harmless', type: 'restart' }),
    })).toBe(false);

    expect(shouldRequireRecoveryApproval({
      policy: makePolicy(),
      request: makeRequest(),
      lastExecutedAtMs: 95_000,
      nowMs: 100_000,
    })).toBe(true);

    expect(shouldRequireRecoveryApproval({
      policy: makePolicy({ auto_execute: false }),
      request: makeRequest(),
      lastExecutedAtMs: 0,
      nowMs: 100_000,
    })).toBe(true);
  });

  it('builds entities and applies scope or status transitions without changing semantics', () => {
    const action = buildRecoveryActionEntity({
      actionId: 'act-2',
      request: makeRequest({ level: 'L1_harmless', type: 'circuit_breaker' }),
      scope: {
        tenant_id: 'tenant-a',
        project_id: 'project-a',
      },
      requiresApproval: false,
      now: '2026-03-25T00:00:00.000Z',
    });

    expect(action).toMatchObject({
      action_id: 'act-2',
      status: 'approved',
      safety: {
        requires_approval: false,
        auto_rollback_on_failure: false,
        estimated_downtime_seconds: 5,
      },
    });
    expect(hasRecoveryActionScope(action, 'tenant-a', 'project-a')).toBe(true);
    expect(hasRecoveryActionScope(action, 'tenant-b', 'project-a')).toBe(false);

    applyRecoveryActionStart(action, '2026-03-25T00:00:10.000Z');
    expect(action.status).toBe('executing');
    expect(action.execution.started_at).toBe('2026-03-25T00:00:10.000Z');

    applyRecoveryActionStatusUpdate({
      action,
      newStatus: 'succeeded',
      updatedAt: '2026-03-25T00:00:20.000Z',
      completedAt: '2026-03-25T00:00:21.000Z',
      result: {
        success: true,
        output: 'done',
        duration_ms: 11,
      },
    });
    expect(action).toMatchObject({
      status: 'succeeded',
      updated_at: '2026-03-25T00:00:20.000Z',
      execution: {
        started_at: '2026-03-25T00:00:10.000Z',
        completed_at: '2026-03-25T00:00:21.000Z',
        result: {
          success: true,
          output: 'done',
          duration_ms: 11,
        },
      },
    });
  });

  it('wraps simulated execution results and recovery policies deterministically', async () => {
    const success = await executeRecoveryActionSimulation({
      action: makeAction(),
      levelLabel: 'L2',
      now: (() => {
        let value = 100;
        return () => {
          value += 7;
          return value;
        };
      })(),
      execute: async () => {},
    });
    expect(success).toEqual({
      success: true,
      output: 'L2 action restart completed successfully',
      duration_ms: 7,
    });

    const failure = await executeRecoveryActionSimulation({
      action: makeAction({ type: 'rollback' }),
      levelLabel: 'L1',
      now: (() => {
        let value = 200;
        return () => {
          value += 5;
          return value;
        };
      })(),
      execute: async () => {
        throw new Error('boom');
      },
    });
    expect(failure).toEqual({
      success: false,
      error: 'boom',
      duration_ms: 5,
    });

    const policy = buildRecoveryPolicyEntity({
      policyId: 'pol-2',
      policy: {
        name: 'Default L1',
        level: 'L1_harmless',
        auto_execute: true,
        allowed_actions: ['restart'],
        cooldown_seconds: 30,
      },
      now: '2026-03-25T00:00:00.000Z',
    });
    expect(policy).toMatchObject({
      policy_id: 'pol-2',
      level: 'L1_harmless',
      auto_execute: true,
      created_at: '2026-03-25T00:00:00.000Z',
      updated_at: '2026-03-25T00:00:00.000Z',
    });
  });
});
