import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearMemoryStore,
  createProposal,
  getIncidentLessonWithScope,
  getRecoveryRecipeWithScope,
  queryKnowledge,
  validateProposal,
} from '../../../src/services/memory/store';

describe('Memory Store', () => {
  beforeEach(() => {
    clearMemoryStore();
  });

  it('should normalize incident_lesson content before validation activates it', async () => {
    const proposal = await createProposal({
      proposal_type: 'incident_lesson',
      content: {
        incident_id: 'inc-lesson-1',
        title: 'Lesson title',
        summary: 'Summary',
        what_happened: 'What happened',
        why_it_happened: 'Why it happened',
        how_we_fixed: 'How fixed',
        how_to_prevent: 'How to prevent',
        tags: ['ops'],
        severity: 'high',
        related_lessons: [],
      },
      source: {
        incident_id: 'inc-lesson-1',
        actor_id: 'actor-a',
      },
      scope: {
        tenant_id: 'tenant-a',
        project_id: 'project-a',
      },
    });

    expect((proposal.content as { lesson_id?: string }).lesson_id).toBe(proposal.proposal_id);

    const lessonBeforeValidation = await getIncidentLessonWithScope(proposal.proposal_id, 'tenant-a', 'project-a');
    expect(lessonBeforeValidation).toBeNull();

    const validated = await validateProposal(proposal.proposal_id, 'validator-a', true);
    expect(validated?.status).toBe('validated');

    const lesson = await getIncidentLessonWithScope(proposal.proposal_id, 'tenant-a', 'project-a');
    expect(lesson).not.toBeNull();
    expect(lesson?.lesson_id).toBe(proposal.proposal_id);
    expect(lesson?.scope.tenant_id).toBe('tenant-a');
    expect(lesson?.scope.project_id).toBe('project-a');
  });

  it('should normalize recovery_recipe content before validation activates it', async () => {
    const proposal = await createProposal({
      proposal_type: 'recovery_recipe',
      content: {
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
          is_global: false,
        },
      },
      source: {
        incident_id: 'inc-recipe-1',
        actor_id: 'actor-a',
      },
      scope: {
        tenant_id: 'tenant-a',
        project_id: 'project-a',
      },
    });

    expect((proposal.content as { recipe_id?: string }).recipe_id).toBe(proposal.proposal_id);

    const validated = await validateProposal(proposal.proposal_id, 'validator-a', true);
    expect(validated?.status).toBe('validated');

    const recipe = await getRecoveryRecipeWithScope(proposal.proposal_id, 'tenant-a', 'project-a');
    expect(recipe).not.toBeNull();
    expect(recipe?.recipe_id).toBe(proposal.proposal_id);
    expect(recipe?.scope.tenant_id).toBe('tenant-a');
    expect(recipe?.scope.project_id).toBe('project-a');
    expect(recipe?.stats.times_used).toBe(0);
  });

  it('should derive a stable default idempotency key for duplicate proposals', async () => {
    const first = await createProposal({
      proposal_type: 'incident_lesson',
      content: {
        incident_id: 'inc-dup-1',
        title: 'Duplicate lesson',
        summary: 'Summary',
        what_happened: 'What happened',
        why_it_happened: 'Why it happened',
        how_we_fixed: 'How fixed',
        how_to_prevent: 'How to prevent',
        tags: ['ops'],
        severity: 'high',
        related_lessons: [],
      },
      source: {
        incident_id: 'inc-dup-1',
        actor_id: 'actor-a',
      },
      scope: {
        tenant_id: 'tenant-a',
        project_id: 'project-a',
      },
    });

    const duplicate = await createProposal({
      proposal_type: 'incident_lesson',
      content: {
        incident_id: 'inc-dup-1',
        title: 'Duplicate lesson',
        summary: 'Summary',
        what_happened: 'What happened',
        why_it_happened: 'Why it happened',
        how_we_fixed: 'How fixed',
        how_to_prevent: 'How to prevent',
        tags: ['ops'],
        severity: 'high',
        related_lessons: [],
      },
      source: {
        incident_id: 'inc-dup-1',
        actor_id: 'actor-a',
      },
      scope: {
        tenant_id: 'tenant-a',
        project_id: 'project-a',
      },
    });

    expect(duplicate.proposal_id).toBe(first.proposal_id);
    expect(duplicate.idempotency_key).toBe(first.idempotency_key);
  });

  it('should apply tags filtering only to validated knowledge entries', async () => {
    const first = await createProposal({
      proposal_type: 'incident_lesson',
      content: {
        incident_id: 'inc-tag-1',
        title: 'Cache lesson',
        summary: 'Summary',
        what_happened: 'What happened',
        why_it_happened: 'Why it happened',
        how_we_fixed: 'How fixed',
        how_to_prevent: 'How to prevent',
        tags: ['cache', 'ops'],
        severity: 'high',
        related_lessons: [],
      },
      source: {
        incident_id: 'inc-tag-1',
        actor_id: 'actor-a',
      },
      scope: {
        tenant_id: 'tenant-a',
        project_id: 'project-a',
      },
    });

    await createProposal({
      proposal_type: 'incident_lesson',
      content: {
        incident_id: 'inc-tag-2',
        title: 'Queue lesson',
        summary: 'Summary',
        what_happened: 'What happened',
        why_it_happened: 'Why it happened',
        how_we_fixed: 'How fixed',
        how_to_prevent: 'How to prevent',
        tags: ['queue'],
        severity: 'medium',
        related_lessons: [],
      },
      source: {
        incident_id: 'inc-tag-2',
        actor_id: 'actor-a',
      },
      scope: {
        tenant_id: 'tenant-a',
        project_id: 'project-a',
      },
    });

    await validateProposal(first.proposal_id, 'validator-a', true);

    const result = await queryKnowledge({
      scope: {
        tenant_id: 'tenant-a',
        project_id: 'project-a',
      },
      tags: ['cache'],
    });

    expect(result.total).toBe(1);
    expect(result.items[0]?.title).toBe('Cache lesson');
  });
});
