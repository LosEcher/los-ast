/**
 * los-memory API 路由 (实验性)
 * Phase 1.2: 经验提案 (candidate/proposal 语义，不直接决定入账)
 *
 * 注意: 此路由仅表达"提案/候选"，最终写入决策由 los-memory 或上层控制面决定
 * 避免侵蚀 los-memory sovereignty
 */
import { createProposal, getProposalWithScope, validateProposal, queryKnowledge, getRecoveryRecipeWithScope, findMatchingRecipes, getIncidentLessonWithScope, getMemoryStats, } from '../../services/memory/store.js';
import { NotFoundError, ValidationError } from '../../types/errors.js';
const scopeSchema = {
    type: 'object',
    properties: {
        tenant_id: { type: 'string' },
        project_id: { type: 'string' },
        actor_id: { type: 'string' },
        mode: { type: 'string', enum: ['local', 'service'] },
    },
};
const proposalIdParamsSchema = {
    type: 'object',
    required: ['id'],
    additionalProperties: false,
    properties: {
        id: { type: 'string', minLength: 1 },
    },
};
const createProposalBodySchema = {
    type: 'object',
    required: ['proposal_type', 'content', 'source'],
    additionalProperties: false,
    properties: {
        scope: scopeSchema,
        proposal_type: { type: 'string', enum: ['corrected_fact', 'rejected_hypothesis', 'incident_lesson', 'recovery_recipe'] },
        content: { type: 'object' },
        source: {
            type: 'object',
            required: ['incident_id', 'actor_id'],
            additionalProperties: false,
            properties: {
                incident_id: { type: 'string', minLength: 1 },
                evidence_bundle_id: { type: 'string', minLength: 1 },
                actor_id: { type: 'string', minLength: 1 },
            },
        },
        idempotency_key: { type: 'string', minLength: 1 },
    },
};
const validateProposalBodySchema = {
    type: 'object',
    required: ['approve'],
    additionalProperties: false,
    properties: {
        scope: scopeSchema,
        validator_id: { type: 'string', minLength: 1 },
        approve: { type: 'boolean' },
        rejection_reason: { type: 'string', minLength: 1 },
    },
};
const recipeFindBodySchema = {
    type: 'object',
    required: ['keywords'],
    additionalProperties: false,
    properties: {
        scope: scopeSchema,
        keywords: {
            type: 'array',
            minItems: 1,
            items: { type: 'string', minLength: 1 },
        },
    },
};
// 查询参数验证函数
function parseProposalType(value) {
    if (!value)
        return undefined;
    const valid = ['corrected_fact', 'rejected_hypothesis', 'incident_lesson', 'recovery_recipe'];
    return valid.includes(value) ? value : undefined;
}
function parseQueryInt(value, defaultValue) {
    if (!value)
        return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
}
/**
 * 注册 Memory Proposals 路由 (实验性)
 */
export default async function memoryProposalsRoutes(fastify) {
    // POST /experimental/memory-proposals/proposals - 创建提案
    fastify.post('/proposals', {
        schema: {
            body: createProposalBodySchema,
        },
    }, async (request, reply) => {
        const body = request.body;
        // 强制验证 request.scope，确保数据归属正确
        const scope = request.scope;
        if (!scope?.tenant_id || !scope?.project_id) {
            throw new ValidationError('INCOMPLETE_SCOPE', 'Request scope must include tenant_id and project_id');
        }
        // 注入 scope 到 proposal
        const proposal = await createProposal({
            ...body,
            scope: {
                tenant_id: scope.tenant_id,
                project_id: scope.project_id,
            },
        });
        reply.status(201);
        return { proposal };
    });
    // GET /experimental/memory-proposals/proposals/:id - 获取提案
    fastify.get('/proposals/:id', {
        schema: {
            params: proposalIdParamsSchema,
        },
    }, async (request) => {
        const { id } = request.params;
        // 强制使用 request.scope 进行租户边界校验
        const scope = request.scope;
        if (!scope?.tenant_id || !scope?.project_id) {
            throw new ValidationError('MISSING_SCOPE', 'Request scope must include tenant_id and project_id');
        }
        // 使用 scope 校验版本，防止跨租户访问
        const proposal = await getProposalWithScope(id, scope.tenant_id, scope.project_id);
        if (!proposal) {
            throw new NotFoundError('Proposal', id);
        }
        return { proposal };
    });
    // POST /experimental/memory-proposals/proposals/:id/validate - 验证提案
    fastify.post('/proposals/:id/validate', {
        schema: {
            params: proposalIdParamsSchema,
            body: validateProposalBodySchema,
        },
    }, async (request) => {
        const { id } = request.params;
        const body = request.body;
        // 强制使用 request.scope 进行租户边界校验
        const scope = request.scope;
        if (!scope?.tenant_id || !scope?.project_id) {
            throw new ValidationError('MISSING_SCOPE', 'Request scope must include tenant_id and project_id');
        }
        // 使用 scope 校验版本，防止跨租户访问
        const existing = await getProposalWithScope(id, scope.tenant_id, scope.project_id);
        if (!existing) {
            throw new NotFoundError('Proposal', id);
        }
        const validatorId = scope.actor_id || body.validator_id;
        if (!validatorId) {
            throw new ValidationError('MISSING_ACTOR_ID', 'Proposal validation requires a verified actor_id');
        }
        const proposal = await validateProposal(id, validatorId, body.approve, body.rejection_reason);
        return { proposal };
    });
    // GET /experimental/memory-proposals/knowledge - 查询知识库
    fastify.get('/knowledge', async (request) => {
        const query = request.query;
        // 强制使用 request.scope 进行租户隔离
        const scope = request.scope;
        if (!scope?.tenant_id || !scope?.project_id) {
            throw new ValidationError('MISSING_SCOPE', 'Request scope must include tenant_id and project_id');
        }
        const params = {
            type: parseProposalType(query.type),
            scope: {
                tenant_id: scope.tenant_id,
                project_id: scope.project_id,
            },
            tags: query.tags?.split(','),
            limit: parseQueryInt(query.limit),
            offset: parseQueryInt(query.offset),
        };
        const result = await queryKnowledge(params);
        return result;
    });
    // GET /experimental/memory-proposals/recipes/:id - 获取恢复方案
    fastify.get('/recipes/:id', {
        schema: {
            params: proposalIdParamsSchema,
        },
    }, async (request) => {
        const { id } = request.params;
        // 强制使用 request.scope 进行租户边界校验
        const scope = request.scope;
        if (!scope?.tenant_id || !scope?.project_id) {
            throw new ValidationError('MISSING_SCOPE', 'Request scope must include tenant_id and project_id');
        }
        // 使用 scope 校验版本，防止跨租户访问（全局方案也可访问）
        const recipe = await getRecoveryRecipeWithScope(id, scope.tenant_id, scope.project_id);
        if (!recipe) {
            throw new NotFoundError('Recipe', id);
        }
        return { recipe };
    });
    // POST /experimental/memory-proposals/recipes/find - 查找匹配的恢复方案
    fastify.post('/recipes/find', {
        schema: {
            body: recipeFindBodySchema,
        },
    }, async (request) => {
        const body = request.body;
        // 强制使用 request.scope 进行租户隔离
        const scope = request.scope;
        if (!scope?.tenant_id || !scope?.project_id) {
            throw new ValidationError('MISSING_SCOPE', 'Request scope must include tenant_id and project_id');
        }
        const recipes = await findMatchingRecipes(scope.tenant_id, scope.project_id, body.keywords);
        return { recipes };
    });
    // GET /experimental/memory-proposals/lessons/:id - 获取事件教训
    fastify.get('/lessons/:id', {
        schema: {
            params: proposalIdParamsSchema,
        },
    }, async (request) => {
        const { id } = request.params;
        // 强制使用 request.scope 进行租户边界校验
        const scope = request.scope;
        if (!scope?.tenant_id || !scope?.project_id) {
            throw new ValidationError('MISSING_SCOPE', 'Request scope must include tenant_id and project_id');
        }
        // 使用 scope 校验版本，防止跨租户访问
        const lesson = await getIncidentLessonWithScope(id, scope.tenant_id, scope.project_id);
        if (!lesson) {
            throw new NotFoundError('Lesson', id);
        }
        return { lesson };
    });
    // GET /experimental/memory-proposals/stats - 获取统计信息
    fastify.get('/stats', async (request) => {
        // 强制使用 request.scope 进行租户隔离
        const scope = request.scope;
        if (!scope?.tenant_id || !scope?.project_id) {
            throw new ValidationError('MISSING_SCOPE', 'Request scope must include tenant_id and project_id');
        }
        const stats = await getMemoryStats(scope.tenant_id, scope.project_id);
        return { stats };
    });
}
