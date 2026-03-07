/**
 * los-memory 存储服务
 * Phase 1.2: 经验沉淀存储
 *
 * 存储和管理经验沉淀数据
 */

import type {
  Proposal,
  CorrectedFact,
  RejectedHypothesis,
  IncidentLesson,
  RecoveryRecipe,
  CreateProposalRequest,
  KnowledgeQuery,
  KnowledgeResponse,
  KnowledgeItem,
  MemoryStats,
} from '@los-ast/shared/types';
import { generateId } from '../../utils/id-generator.js';

// 内存存储 - 后续迁移到 PostgreSQL
const proposalStore: Map<string, Proposal> = new Map();
const factStore: Map<string, CorrectedFact> = new Map();
const rejectionStore: Map<string, RejectedHypothesis> = new Map();
const lessonStore: Map<string, IncidentLesson> = new Map();
const recipeStore: Map<string, RecoveryRecipe> = new Map();

/**
 * 创建提案
 */
export async function createProposal(request: CreateProposalRequest): Promise<Proposal> {
  const now = new Date().toISOString();
  const proposalId = generateId('prp');

  // 生成幂等性 key
  const idempotencyKey =
    request.idempotency_key || `${request.source.incident_id}_${request.proposal_type}_${now}`;

  // 检查幂等性
  for (const proposal of proposalStore.values()) {
    if (proposal.idempotency_key === idempotencyKey) {
      console.log(`[MemoryStore] Duplicate proposal detected: ${proposal.proposal_id}`);
      return proposal;
    }
  }

  const proposal: Proposal = {
    proposal_id: proposalId,
    proposal_type: request.proposal_type,
    content: request.content,
    source: request.source,
    status: 'proposed',
    idempotency_key: idempotencyKey,
    created_at: now,
    updated_at: now,
    version: 1,
  };

  proposalStore.set(proposalId, proposal);

  // 根据类型存储具体内容
  await storeTypedContent(proposalId, request.proposal_type, request.content);

  console.log(`[MemoryStore] Created proposal ${proposalId} of type ${request.proposal_type}`);

  return proposal;
}

/**
 * 存储类型化内容
 */
async function storeTypedContent(
  proposalId: string,
  type: string,
  content: unknown
): Promise<void> {
  const now = new Date().toISOString();

  switch (type) {
    case 'corrected_fact': {
      const fact = content as CorrectedFact;
      factStore.set(fact.fact_id || proposalId, {
        ...fact,
        fact_id: fact.fact_id || proposalId,
        created_at: fact.created_at || now,
      });
      break;
    }

    case 'rejected_hypothesis': {
      const rejection = content as RejectedHypothesis;
      rejectionStore.set(rejection.rejection_id || proposalId, {
        ...rejection,
        rejection_id: rejection.rejection_id || proposalId,
        created_at: rejection.created_at || now,
      });
      break;
    }

    case 'incident_lesson': {
      const lesson = content as IncidentLesson;
      lessonStore.set(lesson.lesson_id || proposalId, {
        ...lesson,
        lesson_id: lesson.lesson_id || proposalId,
        created_at: lesson.created_at || now,
        updated_at: lesson.updated_at || now,
      });
      break;
    }

    case 'recovery_recipe': {
      const recipe = content as RecoveryRecipe;
      recipeStore.set(recipe.recipe_id || proposalId, {
        ...recipe,
        recipe_id: recipe.recipe_id || proposalId,
        stats: recipe.stats || {
          times_used: 0,
          success_rate: 0,
          avg_duration_seconds: 0,
        },
        created_at: recipe.created_at || now,
        updated_at: recipe.updated_at || now,
        version: recipe.version || 1,
      });
      break;
    }
  }
}

/**
 * 获取提案
 */
export async function getProposal(proposalId: string): Promise<Proposal | null> {
  return proposalStore.get(proposalId) || null;
}

/**
 * 验证提案
 */
export async function validateProposal(
  proposalId: string,
  validatorId: string,
  approve: boolean,
  rejectionReason?: string
): Promise<Proposal | null> {
  const proposal = proposalStore.get(proposalId);
  if (!proposal) {
    return null;
  }

  const now = new Date().toISOString();

  if (!proposal.validation) {
    proposal.validation = {
      validated_by: [],
    };
  }

  proposal.validation.validated_by.push(validatorId);

  if (approve) {
    proposal.status = 'validated';
    proposal.validation.validated_at = now;

    // 激活具体内容
    await activateTypedContent(proposal.proposal_type, proposal.content);
  } else {
    proposal.status = 'rejected';
    proposal.validation.rejection_reason = rejectionReason || 'Rejected by validator';
  }

  proposal.updated_at = now;
  proposal.version += 1;

  proposalStore.set(proposalId, proposal);

  console.log(`[MemoryStore] Validated proposal ${proposalId}: ${approve ? 'approved' : 'rejected'}`);

  return proposal;
}

/**
 * 激活类型化内容
 */
async function activateTypedContent(type: string, content: unknown): Promise<void> {
  const now = new Date().toISOString();

  switch (type) {
    case 'incident_lesson': {
      const lesson = content as IncidentLesson;
      lessonStore.set(lesson.lesson_id, {
        ...lesson,
        updated_at: now,
      });
      break;
    }

    case 'recovery_recipe': {
      const recipe = content as RecoveryRecipe;
      recipeStore.set(recipe.recipe_id, {
        ...recipe,
        updated_at: now,
      });
      break;
    }
  }
}

/**
 * 查询知识库
 */
export async function queryKnowledge(query: KnowledgeQuery): Promise<KnowledgeResponse> {
  const items: KnowledgeItem[] = [];

  // 根据类型查询
  if (!query.type || query.type === 'incident_lesson') {
    for (const lesson of lessonStore.values()) {
      items.push({
        item_id: lesson.lesson_id,
        item_type: 'incident_lesson',
        title: lesson.title,
        content: lesson,
        relevance_score: 1.0,
        source_incident_id: lesson.incident_id,
        created_at: lesson.created_at,
      });
    }
  }

  if (!query.type || query.type === 'recovery_recipe') {
    for (const recipe of recipeStore.values()) {
      items.push({
        item_id: recipe.recipe_id,
        item_type: 'recovery_recipe',
        title: recipe.name,
        content: recipe,
        relevance_score: 1.0,
        source_incident_id: recipe.source.created_from_incident,
        created_at: recipe.created_at,
      });
    }
  }

  if (!query.type || query.type === 'corrected_fact') {
    for (const fact of factStore.values()) {
      items.push({
        item_id: fact.fact_id,
        item_type: 'corrected_fact',
        title: fact.corrected_understanding.substring(0, 50),
        content: fact,
        relevance_score: fact.confidence,
        source_incident_id: fact.source_incident_id,
        created_at: fact.created_at,
      });
    }
  }

  if (!query.type || query.type === 'rejected_hypothesis') {
    for (const rejection of rejectionStore.values()) {
      items.push({
        item_id: rejection.rejection_id,
        item_type: 'rejected_hypothesis',
        title: rejection.hypothesis_text.substring(0, 50),
        content: rejection,
        relevance_score: 1.0,
        source_incident_id: rejection.source_incident_id,
        created_at: rejection.created_at,
      });
    }
  }

  // 过滤范围
  if (query.scope?.tenant_id) {
    // 简化实现 - 实际应该根据内容中的 scope 过滤
    // 这里仅作演示
  }

  // 过滤标签
  if (query.tags && query.tags.length > 0) {
    // 简化实现
  }

  // 分页
  const total = items.length;
  const offset = query.offset || 0;
  const limit = query.limit || 20;

  const paginatedItems = items.slice(offset, offset + limit);

  return {
    items: paginatedItems,
    total,
    has_more: offset + limit < total,
    next_offset: offset + limit < total ? offset + limit : undefined,
  };
}

/**
 * 获取恢复方案
 */
export async function getRecoveryRecipe(recipeId: string): Promise<RecoveryRecipe | null> {
  return recipeStore.get(recipeId) || null;
}

/**
 * 查找匹配的恢复方案
 */
export async function findMatchingRecipes(
  tenantId: string,
  projectId: string,
  keywords: string[]
): Promise<RecoveryRecipe[]> {
  const matches: RecoveryRecipe[] = [];

  for (const recipe of recipeStore.values()) {
    // 检查范围匹配
    const scopeMatch =
      recipe.scope.is_global ||
      (recipe.scope.tenant_id === tenantId && recipe.scope.project_id === projectId);

    if (!scopeMatch) continue;

    // 检查关键词匹配
    const keywordMatch = keywords.some((kw) => {
      const lowerKw = kw.toLowerCase();
      return (
        recipe.name.toLowerCase().includes(lowerKw) ||
        recipe.description.toLowerCase().includes(lowerKw) ||
        recipe.triggers.symptom_keywords.some((sk) => sk.toLowerCase().includes(lowerKw))
      );
    });

    if (keywordMatch) {
      matches.push(recipe);
    }
  }

  // 按成功率排序
  matches.sort((a, b) => b.stats.success_rate - a.stats.success_rate);

  return matches;
}

/**
 * 更新方案使用统计
 */
export async function updateRecipeStats(
  recipeId: string,
  success: boolean,
  durationSeconds: number
): Promise<void> {
  const recipe = recipeStore.get(recipeId);
  if (!recipe) return;

  const stats = recipe.stats;
  const totalUses = stats.times_used + 1;

  stats.times_used = totalUses;
  stats.success_rate = (stats.success_rate * (totalUses - 1) + (success ? 1 : 0)) / totalUses;
  stats.avg_duration_seconds =
    (stats.avg_duration_seconds * (totalUses - 1) + durationSeconds) / totalUses;

  recipe.updated_at = new Date().toISOString();
  recipe.version += 1;

  recipeStore.set(recipeId, recipe);

  console.log(`[MemoryStore] Updated recipe ${recipeId} stats: success=${success}`);
}

/**
 * 获取事件教训
 */
export async function getIncidentLesson(lessonId: string): Promise<IncidentLesson | null> {
  return lessonStore.get(lessonId) || null;
}

/**
 * 获取统计信息
 */
export async function getMemoryStats(): Promise<MemoryStats> {
  const byType = {
    corrected_fact: factStore.size,
    rejected_hypothesis: rejectionStore.size,
    incident_lesson: lessonStore.size,
    recovery_recipe: recipeStore.size,
  };

  const byStatus: Record<string, number> = {};
  for (const proposal of proposalStore.values()) {
    byStatus[proposal.status] = (byStatus[proposal.status] || 0) + 1;
  }

  return {
    total_proposals: proposalStore.size,
    by_type: byType,
    by_status: byStatus,
    active_lessons: lessonStore.size,
    active_recipes: recipeStore.size,
  };
}

/**
 * 清空存储 (用于测试)
 */
export function clearMemoryStore(): void {
  proposalStore.clear();
  factStore.clear();
  rejectionStore.clear();
  lessonStore.clear();
  recipeStore.clear();
}
