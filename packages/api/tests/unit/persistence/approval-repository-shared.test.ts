import { describe, expect, it, vi } from 'vitest';
import type { ApprovalItem } from '@los-ast/shared/types';
import {
  buildApprovalStats,
  buildApprovalWhereClause,
  listExpiredPendingApprovalEntries,
  parseStoredApproval,
  queryApprovalItems,
} from '../../../src/persistence/repositories/approval-repository/shared';

function buildApproval(overrides: Partial<ApprovalItem> = {}): ApprovalItem {
  return {
    approval_id: 'apr-1',
    item_type: 'recovery_action',
    item_id: 'item-1',
    title: 'Approval',
    description: 'Approval description',
    risk_level: 'medium',
    status: 'pending',
    requester: {
      actor_id: 'actor-a',
      timestamp: '2026-03-25T00:00:00.000Z',
    },
    timeout_at: '2026-03-25T01:00:00.000Z',
    scope: {
      tenant_id: 'tenant-a',
      project_id: 'project-a',
    },
    created_at: '2026-03-25T00:00:00.000Z',
    updated_at: '2026-03-25T00:00:00.000Z',
    version: 1,
    ...overrides,
  };
}

describe('approval repository shared helpers', () => {
  it('queries approvals by scope and pagination with newest first ordering', () => {
    const result = queryApprovalItems([
      buildApproval({ approval_id: 'apr-old', created_at: '2026-03-25T00:00:00.000Z' }),
      buildApproval({ approval_id: 'apr-new', created_at: '2026-03-25T00:10:00.000Z', risk_level: 'high' }),
      buildApproval({
        approval_id: 'apr-other-scope',
        scope: { tenant_id: 'tenant-b', project_id: 'project-b' },
      }),
    ], {
      tenant_id: 'tenant-a',
      project_id: 'project-a',
      limit: 1,
    });

    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.approval_id)).toEqual(['apr-new']);
    expect(result.has_more).toBe(true);
    expect(result.next_offset).toBe(1);
  });

  it('builds approval stats and expired pending entry lists conservatively', () => {
    const pending = buildApproval({
      timeout_at: '2026-03-25T00:10:00.000Z',
    });
    const approved = buildApproval({
      approval_id: 'apr-2',
      status: 'approved',
      risk_level: 'high',
      item_type: 'code_patch',
      requester: { actor_id: 'actor-a', timestamp: '2026-03-25T00:00:00.000Z' },
      approver: { actor_id: 'actor-b', timestamp: '2026-03-25T00:05:00.000Z' },
      timeout_at: '2026-03-25T00:03:00.000Z',
    });

    const stats = buildApprovalStats([pending, approved], 'tenant-a', 'project-a');
    expect(stats).toMatchObject({
      total: 2,
      by_status: {
        pending: 1,
        approved: 1,
      },
      by_type: {
        recovery_action: 1,
        code_patch: 1,
      },
      avg_decision_time_seconds: 300,
    });

    const expired = listExpiredPendingApprovalEntries([
      ['apr-1', pending],
      ['apr-2', approved],
    ], '2026-03-25T00:30:00.000Z');
    expect(expired.map(([id]) => id)).toEqual(['apr-1']);
  });

  it('builds sqlite where clauses and ignores invalid stored approval payloads', () => {
    expect(buildApprovalWhereClause({
      tenant_id: 'tenant-a',
      project_id: 'project-a',
      status: 'pending',
      item_type: 'recovery_action',
    })).toEqual({
      whereClause: 'WHERE tenant_id = ? AND project_id = ? AND status = ? AND item_type = ?',
      values: ['tenant-a', 'project-a', 'pending', 'recovery_action'],
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseStoredApproval('{"approval_id":"apr-1"}', 'apr-1')).toEqual({ approval_id: 'apr-1' });
    expect(parseStoredApproval('{', 'apr-bad')).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });
});
