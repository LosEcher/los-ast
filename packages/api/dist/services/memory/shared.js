import crypto from 'node:crypto';
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
export function buildDefaultIdempotencyKey(request) {
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
export function extractKnowledgeTags(content) {
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
export async function normalizeTypedContent(proposalId, type, content, scope) {
    const now = new Date().toISOString();
    switch (type) {
        case 'corrected_fact': {
            const fact = content;
            const normalizedFact = {
                ...fact,
                fact_id: fact.fact_id || proposalId,
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
        default:
            return content;
    }
}
export async function activateTypedContent(type, content, stores) {
    const now = new Date().toISOString();
    switch (type) {
        case 'corrected_fact': {
            const fact = content;
            stores.factStore.set(fact.fact_id, fact);
            break;
        }
        case 'rejected_hypothesis': {
            const rejection = content;
            stores.rejectionStore.set(rejection.rejection_id, rejection);
            break;
        }
        case 'incident_lesson': {
            const lesson = content;
            stores.lessonStore.set(lesson.lesson_id, {
                ...lesson,
                updated_at: now,
            });
            break;
        }
        case 'recovery_recipe': {
            const recipe = content;
            stores.recipeStore.set(recipe.recipe_id, {
                ...recipe,
                updated_at: now,
            });
            break;
        }
    }
}
export function isTenantProjectScopeMatch(scope, tenantId, projectId) {
    return scope.tenant_id === tenantId && scope.project_id === projectId;
}
export function isRecipeVisibleToScope(scope, tenantId, projectId) {
    return scope.is_global || isTenantProjectScopeMatch(scope, tenantId, projectId);
}
export function isKnowledgeContentVisible(content, queryScope) {
    const itemScope = content?.scope;
    if (!itemScope) {
        return false;
    }
    if ('is_global' in itemScope && itemScope.is_global) {
        return true;
    }
    if (!queryScope?.tenant_id || !queryScope?.project_id) {
        return false;
    }
    return isTenantProjectScopeMatch(itemScope, queryScope.tenant_id, queryScope.project_id);
}
