/**
 * los-memory 存储服务
 * Phase 1.2: 经验沉淀存储
 *
 * 存储和管理经验沉淀数据
 */
import crypto from 'node:crypto';
import { generateId } from '../../utils/id-generator.js';
import { memoryRepository } from '../../persistence/repositories/memory-repository.js';
const proposalStore = memoryRepository.proposals;
const factStore = memoryRepository.facts;
const rejectionStore = memoryRepository.rejections;
const lessonStore = memoryRepository.lessons;
const recipeStore = memoryRepository.recipes;
function stableSerialize(value) {
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        const entries = Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`);
        return `{${entries.join(',')}}`;
    }
    return JSON.stringify(value);
}
function buildDefaultIdempotencyKey(request) {
    const rawKey = stableSerialize({
        incident_id: request.source.incident_id,
        proposal_type: request.proposal_type,
        scope: {
            tenant_id: request.scope.tenant_id ?? null,
            project_id: request.scope.project_id ?? null,
        },
        content: request.content,
    });
    return crypto.createHash('sha256').update(rawKey).digest('hex');
}
function extractKnowledgeTags(content) {
    if (!content || typeof content !== 'object') {
        return [];
    }
    const typedContent = content;
    if (Array.isArray(typedContent.tags)) {
        return typedContent.tags.filter((item) => typeof item === 'string');
    }
    const symptomKeywords = typedContent.triggers?.symptom_keywords;
    if (Array.isArray(symptomKeywords)) {
        return symptomKeywords.filter((item) => typeof item === 'string');
    }
    return [];
}
/**
 * 创建提案
 */
export async function createProposal(request) {
    const scopedRequest = request;
    const now = new Date().toISOString();
    const proposalId = generateId('prp');
    // 生成幂等性 key
    const idempotencyKey = request.idempotency_key || buildDefaultIdempotencyKey(scopedRequest);
    // 检查幂等性
    for (const proposal of proposalStore.values()) {
        if (proposal.idempotency_key === idempotencyKey) {
            console.log(`[MemoryStore] Duplicate proposal detected: ${proposal.proposal_id}`);
            return proposal;
        }
    }
    const normalizedContent = await normalizeTypedContent(proposalId, request.proposal_type, request.content, scopedRequest.scope);
    const proposal = {
        proposal_id: proposalId,
        proposal_type: request.proposal_type,
        content: normalizedContent,
        source: request.source,
        status: 'proposed',
        scope: scopedRequest.scope,
        idempotency_key: idempotencyKey,
        created_at: now,
        updated_at: now,
        version: 1,
    };
    proposalStore.set(proposalId, proposal);
    console.log(`[MemoryStore] Created proposal ${proposalId} of type ${request.proposal_type}`);
    return proposal;
}
/**
 * 存储类型化内容
 * 强制注入 proposal.scope 到 content 中，防止 scope 伪造
 */
async function normalizeTypedContent(proposalId, type, content, scope) {
    const now = new Date().toISOString();
    switch (type) {
        case 'corrected_fact': {
            const fact = content;
            const normalizedFact = {
                ...fact,
                fact_id: fact.fact_id || proposalId,
                // 强制注入 scope，防止伪造
                scope: {
                    tenant_id: scope.tenant_id,
                    project_id: scope.project_id,
                },
                created_at: fact.created_at || now,
            };
            return normalizedFact;
        }
        case 'rejected_hypothesis': {
            const rejection = content;
            const normalizedRejection = {
                ...rejection,
                rejection_id: rejection.rejection_id || proposalId,
                // 强制注入 scope，防止伪造
                scope: {
                    tenant_id: scope.tenant_id,
                    project_id: scope.project_id,
                },
                created_at: rejection.created_at || now,
            };
            return normalizedRejection;
        }
        case 'incident_lesson': {
            const lesson = content;
            const normalizedLesson = {
                ...lesson,
                lesson_id: lesson.lesson_id || proposalId,
                // 强制注入 scope，防止伪造
                scope: {
                    tenant_id: scope.tenant_id,
                    project_id: scope.project_id,
                },
                created_at: lesson.created_at || now,
                updated_at: lesson.updated_at || now,
            };
            return normalizedLesson;
        }
        case 'recovery_recipe': {
            const recipe = content;
            const normalizedRecipe = {
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
            };
            return normalizedRecipe;
        }
    }
    return content;
}
/**
 * 获取提案
 */
export async function getProposal(proposalId) {
    return proposalStore.get(proposalId) || null;
}
/**
 * 获取提案（带 scope 校验）
 * 返回 null 如果提案不存在或 scope 不匹配
 */
export async function getProposalWithScope(proposalId, tenant_id, project_id) {
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
export async function validateProposal(proposalId, validatorId, approve, rejectionReason) {
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
    }
    else {
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
async function activateTypedContent(type, content) {
    const now = new Date().toISOString();
    switch (type) {
        case 'corrected_fact': {
            const fact = content;
            factStore.set(fact.fact_id, fact);
            break;
        }
        case 'rejected_hypothesis': {
            const rejection = content;
            rejectionStore.set(rejection.rejection_id, rejection);
            break;
        }
        case 'incident_lesson': {
            const lesson = content;
            lessonStore.set(lesson.lesson_id, {
                ...lesson,
                updated_at: now,
            });
            break;
        }
        case 'recovery_recipe': {
            const recipe = content;
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
export async function queryKnowledge(query) {
    const items = [];
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
        const content = item.content;
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
        return (itemScope.tenant_id === query.scope.tenant_id &&
            itemScope.project_id === query.scope.project_id);
    });
    // 过滤标签
    let scopedItems = filteredItems;
    if (query.tags && query.tags.length > 0) {
        const normalizedTags = query.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
        if (normalizedTags.length > 0) {
            scopedItems = filteredItems.filter((item) => {
                const tags = extractKnowledgeTags(item.content).map((tag) => tag.toLowerCase());
                return normalizedTags.every((tag) => tags.includes(tag));
            });
        }
    }
    // 分页
    const total = scopedItems.length;
    const offset = query.offset || 0;
    const limit = query.limit || 20;
    const paginatedItems = scopedItems.slice(offset, offset + limit);
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
export async function getRecoveryRecipe(recipeId) {
    return recipeStore.get(recipeId) || null;
}
/**
 * 获取恢复方案（带 scope 校验）
 * 返回 null 如果方案不存在或 scope 不匹配
 */
export async function getRecoveryRecipeWithScope(recipeId, tenant_id, project_id) {
    const recipe = recipeStore.get(recipeId);
    if (!recipe) {
        return null;
    }
    // 检查 scope：全局可见或匹配 tenant/project
    const scopeMatch = recipe.scope.is_global ||
        (recipe.scope.tenant_id === tenant_id && recipe.scope.project_id === project_id);
    if (!scopeMatch) {
        return null;
    }
    return recipe;
}
/**
 * 查找匹配的恢复方案
 */
export async function findMatchingRecipes(tenantId, projectId, keywords) {
    const matches = [];
    for (const recipe of recipeStore.values()) {
        // 检查范围匹配
        const scopeMatch = recipe.scope.is_global ||
            (recipe.scope.tenant_id === tenantId && recipe.scope.project_id === projectId);
        if (!scopeMatch)
            continue;
        // 检查关键词匹配
        const keywordMatch = keywords.some((kw) => {
            const lowerKw = kw.toLowerCase();
            return (recipe.name.toLowerCase().includes(lowerKw) ||
                recipe.description.toLowerCase().includes(lowerKw) ||
                recipe.triggers.symptom_keywords.some((sk) => sk.toLowerCase().includes(lowerKw)));
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
export async function updateRecipeStats(recipeId, success, durationSeconds) {
    const recipe = recipeStore.get(recipeId);
    if (!recipe)
        return;
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
export async function getIncidentLesson(lessonId) {
    return lessonStore.get(lessonId) || null;
}
/**
 * 获取事件教训（带 scope 校验）
 * 返回 null 如果教训不存在或 scope 不匹配
 */
export async function getIncidentLessonWithScope(lessonId, tenant_id, project_id) {
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
export async function getMemoryStats(tenant_id, project_id) {
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
            by_status: {},
            active_lessons: 0,
            active_recipes: 0,
        };
    }
    // 按 scope 过滤统计
    let filteredProposals = 0;
    const byStatus = {};
    for (const proposal of proposalStore.values()) {
        if (proposal.scope.tenant_id === tenant_id &&
            proposal.scope.project_id === project_id) {
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
        if (rejection.scope.tenant_id === tenant_id &&
            rejection.scope.project_id === project_id) {
            rejectionCount++;
        }
    }
    let lessonCount = 0;
    for (const lesson of lessonStore.values()) {
        if (lesson.scope.tenant_id === tenant_id &&
            lesson.scope.project_id === project_id) {
            lessonCount++;
        }
    }
    let recipeCount = 0;
    for (const recipe of recipeStore.values()) {
        // Recipe 支持全局可见
        const scopeMatch = recipe.scope.is_global ||
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
export function clearMemoryStore() {
    proposalStore.clear();
    factStore.clear();
    rejectionStore.clear();
    lessonStore.clear();
    recipeStore.clear();
}
