/**
 * los-memory API 路由
 * Phase 1.2: 经验沉淀存储
 */
import { createProposal, getProposal, validateProposal, queryKnowledge, getRecoveryRecipe, findMatchingRecipes, getIncidentLesson, getMemoryStats, } from '../services/memory/store.js';
/**
 * 注册 Memory 路由
 */
export default async function memoryRoutes(fastify) {
    // POST /memory/proposals - 创建提案
    fastify.post('/proposals', async (request, reply) => {
        const body = request.body;
        const proposal = await createProposal(body);
        reply.status(201);
        return { proposal };
    });
    // GET /memory/proposals/:id - 获取提案
    fastify.get('/proposals/:id', async (request, reply) => {
        const { id } = request.params;
        const proposal = await getProposal(id);
        if (!proposal) {
            reply.status(404);
            return { error: { message: 'Proposal not found' } };
        }
        return { proposal };
    });
    // POST /memory/proposals/:id/validate - 验证提案
    fastify.post('/proposals/:id/validate', async (request, reply) => {
        const { id } = request.params;
        const body = request.body;
        const proposal = await validateProposal(id, body.validator_id, body.approve, body.rejection_reason);
        if (!proposal) {
            reply.status(404);
            return { error: { message: 'Proposal not found' } };
        }
        return { proposal };
    });
    // GET /memory/knowledge - 查询知识库
    fastify.get('/knowledge', async (request) => {
        const query = request.query;
        const params = {
            type: query.type,
            scope: {
                tenant_id: query.tenant_id,
                project_id: query.project_id,
            },
            tags: query.tags?.split(','),
            limit: query.limit ? parseInt(query.limit, 10) : undefined,
            offset: query.offset ? parseInt(query.offset, 10) : undefined,
        };
        const result = await queryKnowledge(params);
        return result;
    });
    // GET /memory/recipes/:id - 获取恢复方案
    fastify.get('/recipes/:id', async (request, reply) => {
        const { id } = request.params;
        const recipe = await getRecoveryRecipe(id);
        if (!recipe) {
            reply.status(404);
            return { error: { message: 'Recipe not found' } };
        }
        return { recipe };
    });
    // POST /memory/recipes/find - 查找匹配的恢复方案
    fastify.post('/recipes/find', async (request) => {
        const body = request.body;
        const recipes = await findMatchingRecipes(body.tenant_id, body.project_id, body.keywords);
        return { recipes };
    });
    // GET /memory/lessons/:id - 获取事件教训
    fastify.get('/lessons/:id', async (request, reply) => {
        const { id } = request.params;
        const lesson = await getIncidentLesson(id);
        if (!lesson) {
            reply.status(404);
            return { error: { message: 'Lesson not found' } };
        }
        return { lesson };
    });
    // GET /memory/stats - 获取统计信息
    fastify.get('/stats', async () => {
        const stats = await getMemoryStats();
        return { stats };
    });
}
//# sourceMappingURL=memory.js.map