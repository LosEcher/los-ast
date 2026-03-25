import { describe, expect, it } from 'vitest';
import {
  buildDefaultIdempotencyKey,
  isKnowledgeContentVisible,
  isRecipeVisibleToScope,
  normalizeTypedContent,
} from '../../../src/services/memory/shared';

describe('memory store shared helpers', () => {
  it('builds a stable default idempotency key for reordered content objects', () => {
    const first = buildDefaultIdempotencyKey({
      proposal_type: 'incident_lesson',
      content: {
        summary: 'Summary',
        title: 'Title',
        nested: { b: 2, a: 1 },
      },
      source: {
        incident_id: 'inc-1',
        actor_id: 'actor-a',
      },
      scope: {
        tenant_id: 'tenant-a',
        project_id: 'project-a',
      },
    });

    const second = buildDefaultIdempotencyKey({
      proposal_type: 'incident_lesson',
      content: {
        nested: { a: 1, b: 2 },
        title: 'Title',
        summary: 'Summary',
      },
      source: {
        incident_id: 'inc-1',
        actor_id: 'actor-a',
      },
      scope: {
        project_id: 'project-a',
        tenant_id: 'tenant-a',
      },
    });

    expect(second).toBe(first);
  });

  it('normalizes recovery recipe content with enforced scope and default stats', async () => {
    const normalized = await normalizeTypedContent(
      'prp-1',
      'recovery_recipe',
      {
        name: 'Restart cache',
        description: 'Restart cache nodes safely',
        triggers: {
          metric_patterns: [],
          log_patterns: [],
          symptom_keywords: ['cache'],
        },
        actions: [],
        prerequisites: [],
        estimated_duration_seconds: 30,
        rollback_strategy: 'Restore previous config',
        source: {
          type: 'manual',
          created_by: 'actor-a',
        },
        scope: {
          tenant_id: 'forged-tenant',
          project_id: 'forged-project',
          is_global: true,
        },
      },
      {
        tenant_id: 'tenant-a',
        project_id: 'project-a',
      }
    );

    expect(normalized).toMatchObject({
      recipe_id: 'prp-1',
      scope: {
        tenant_id: 'tenant-a',
        project_id: 'project-a',
        is_global: true,
      },
      stats: {
        times_used: 0,
        success_rate: 0,
        avg_duration_seconds: 0,
      },
      version: 1,
    });
  });

  it('applies knowledge visibility with global recipe exceptions and safe defaults', () => {
    expect(
      isKnowledgeContentVisible(
        {
          scope: {
            tenant_id: 'tenant-a',
            project_id: 'project-a',
          },
        },
        {
          tenant_id: 'tenant-a',
          project_id: 'project-a',
        }
      )
    ).toBe(true);

    expect(
      isKnowledgeContentVisible(
        {
          scope: {
            is_global: true,
          },
        },
        undefined
      )
    ).toBe(true);

    expect(isKnowledgeContentVisible({}, { tenant_id: 'tenant-a', project_id: 'project-a' })).toBe(false);
    expect(
      isRecipeVisibleToScope(
        {
          tenant_id: 'tenant-a',
          project_id: 'project-a',
          is_global: false,
        },
        'tenant-a',
        'project-a'
      )
    ).toBe(true);
    expect(
      isRecipeVisibleToScope(
        {
          tenant_id: 'tenant-a',
          project_id: 'project-a',
          is_global: false,
        },
        'tenant-b',
        'project-b'
      )
    ).toBe(false);
  });
});
