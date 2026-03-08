/**
 * los-memory 存储服务
 * Phase 1.2: 经验沉淀存储
 *
 * 存储和管理经验沉淀数据
 */

import type {
  Proposal,
  Scope,
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
    scope: request.scope,
    idempotency_key: idempotencyKey,
    created_at: now,
    updated_at: now,
    version: 1,
  };

  proposalStore.set(proposalId, proposal);

  // 根据类型存储具体内容
  // 传入 request.scope 强制注入到 content 中，防止 content.scope 被伪造
  await storeTypedContent(proposalId, request.proposal_type, request.content, request.scope);

  console.log(`[MemoryStore] Created proposal ${proposalId} of type ${request.proposal_type}`);

  return proposal;
}

/**
 * 存储类型化内容
 * 强制注入 proposal.scope 到 content 中，防止 scope 伪造
 */
async function storeTypedContent(
  proposalId: string,
  type: string,
  content: unknown,
  scope: Scope
): Promise<void> {
  const now = new Date().toISOString();

  switch (type) {
    case 'corrected_fact': {
      const fact = content as CorrectedFact;
      factStore.set(fact.fact_id || proposalId, {
        ...fact,
        fact_id: fact.fact_id || proposalId,
        // 强制注入 scope，防止伪造
        scope: {
          tenant_id: scope.tenant_id!,
          project_id: scope.project_id!,
        },
        created_at: fact.created_at || now,
      });
      break;
    }

    case 'rejected_hypothesis': {
      const rejection = content as RejectedHypothesis;
      rejectionStore.set(rejection.rejection_id || proposalId, {
        ...rejection,
        rejection_id: rejection.rejection_id || proposalId,
        // 强制注入 scope，防止伪造
        scope: {
          tenant_id: scope.tenant_id!,
          project_id: scope.project_id!,
        },
        created_at: rejection.created_at || now,
      });
      break;
    }

    case 'incident_lesson': {
      const lesson = content as IncidentLesson;
      lessonStore.set(lesson.lesson_id || proposalId, {
        ...lesson,
        lesson_id: lesson.lesson_id || proposalId,
        // 强制注入 scope，防止伪造
        scope: {
          tenant_id: scope.tenant_id!,
          project_id: scope.project_id!,
        },
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
        // 强制注入 scope，防止伪造（保留 is_global 如果已设置）
        scope: {
          tenant_id: scope.tenant_id,
          project_id: scope.project_id,
          is_global: recipe.scope?.is_global || false,
        },
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
 * 获取提案（带 scope 校验）
 * 返回 null 如果提案不存在或 scope 不匹配
 */
export async function getProposalWithScope(
  proposalId: string,
  tenant_id: string,
  project_id: string
): Promise<Proposal | null> {
  const proposal = proposalStore.get(proposalId);
  if (!proposal) {
    return null;
  }
  // 强制 scope 边界检查
  if (proposal.scope.tenant_id !== tenant_id || proposal.scope.project_id !== project_id) {
    return null;
  }
  return proposal;
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

  // 按 scope 过滤（强制租户隔离）
  const filteredItems = items.filter((item) => {
    const content = item.content as { scope?: { tenant_id?: string; project_id?: string; is_global?: boolean } };
    const itemScope = content.scope;

    // 如果没有 scope 信息，拒绝访问（安全默认）
    if (!itemScope) {
      return false;
    }

    // 全局项目（如 RecoveryRecipe）对所有租户可见
    if (itemScope.is_global) {
      return true;
    }

    // 强制要求 query.scope 中的 tenant_id 和 project_id
    if (!query.scope?.tenant_id || !query.scope?.project_id) {
      return false;
    }

    // 匹配 tenant_id 和 project_id
    return (
      itemScope.tenant_id === query.scope.tenant_id &&
      itemScope.project_id === query.scope.project_id
    );
  });

  // 过滤标签
  if (query.tags && query.tags.length > 0) {
    // 简化实现 - 可以在这里添加标签过滤逻辑
  }

  // 分页
  const total = filteredItems.length;
  const offset = query.offset || 0;
  const limit = query.limit || 20;

  const paginatedItems = filteredItems.slice(offset, offset + limit);

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
 * 获取恢复方案（带 scope 校验）
 * 返回 null 如果方案不存在或 scope 不匹配
 */
export async function getRecoveryRecipeWithScope(
  recipeId: string,
  tenant_id: string,
  project_id: string
): Promise<RecoveryRecipe | null> {
  const recipe = recipeStore.get(recipeId);
  if (!recipe) {
    return null;
  }
  // 检查 scope：全局可见或匹配 tenant/project
  const scopeMatch =
    recipe.scope.is_global ||
    (recipe.scope.tenant_id === tenant_id && recipe.scope.project_id === project_id);
  if (!scopeMatch) {
    return null;
  }
  return recipe;
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
 * 获取事件教训（带 scope 校验）
 * 返回 null 如果教训不存在或 scope 不匹配
 */
export async function getIncidentLessonWithScope(
  lessonId: string,
  tenant_id: string,
  project_id: string
): Promise<IncidentLesson | null> {
  const lesson = lessonStore.get(lessonId);
  if (!lesson) {
    return null;
  }
  // 强制 scope 边界检查
  if (lesson.scope.tenant_id !== tenant_id || lesson.scope.project_id !== project_id) {
    return null;
  }
  return lesson;
}

/**
 * 获取统计信息（按 scope 过滤）
 */
export async function getMemoryStats(
  tenant_id?: string,
  project_id?: string
): Promise<MemoryStats> {
  // 如果没有提供 scope，返回空统计（安全默认）
  if (!tenant_id || !project_id) {
    return {
      total_proposals: 0,
      by_type: {
        corrected_fact: 0,
        rejected_hypothesis: 0,
        incident_lesson: 0,
        recovery_recipe: 0,
      },
      by_status: {} as MemoryStats['by_status'],
      active_lessons: 0,
      active_recipes: 0,
    };
  }

  // 按 scope 过滤统计
  let filteredProposals = 0;
  const byStatus: Record<string, number> = {};

  for (const proposal of proposalStore.values()) {
    if (
      proposal.scope.tenant_id === tenant_id &&
      proposal.scope.project_id === project_id
    ) {
      filteredProposals++;
      byStatus[proposal.status] = (byStatus[proposal.status] || 0) + 1;
    }
  }

  // 统计各类型（按 scope 过滤）
  let factCount = 0;
  for (const fact of factStore.values()) {
    if (fact.scope.tenant_id === tenant_id && fact.scope.project_id === project_id) {
      factCount++;
    }
  }

  let rejectionCount = 0;
  for (const rejection of rejectionStore.values()) {
    if (
      rejection.scope.tenant_id === tenant_id &&
      rejection.scope.project_id === project_id
    ) {
      rejectionCount++;
    }
  }

  let lessonCount = 0;
  for (const lesson of lessonStore.values()) {
    if (
      lesson.scope.tenant_id === tenant_id &&
      lesson.scope.project_id === project_id
    ) {
      lessonCount++;
    }
  }

  let recipeCount = 0;
  for (const recipe of recipeStore.values()) {
    // Recipe 支持全局可见
    const scopeMatch =
      recipe.scope.is_global ||
      (recipe.scope.tenant_id === tenant_id && recipe.scope.project_id === project_id);
    if (scopeMatch) {
      recipeCount++;
    }
  }

  return {
    total_proposals: filteredProposals,
    by_type: {
      corrected_fact: factCount,
      rejected_hypothesis: rejectionCount,
      incident_lesson: lessonCount,
      recovery_recipe: recipeCount,
    },
    by_status: byStatus,
    active_lessons: lessonCount,
    active_recipes: recipeCount,
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
