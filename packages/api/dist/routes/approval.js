/**
 * 审批中心 API 路由
 * Phase 1.5: 审批中心工作流
 */
import { createApproval, getApproval, processApproval, queryApprovals, getApprovalStats, } from '../services/approval/store.js';
/**
 * 注册 Approval 路由
 */
export default async function approvalRoutes(fastify) {
    // GET /approvals - 查询审批项
    fastify.get('/', async (request) => {
        const query = request.query;
        const params = {
            tenant_id: query.tenant_id,
            project_id: query.project_id,
            status: query.status,
            risk_level: query.risk_level,
            item_type: query.item_type,
            limit: query.limit ? parseInt(query.limit, 10) : undefined,
            offset: query.offset ? parseInt(query.offset, 10) : undefined,
        };
        const result = await queryApprovals(params);
        return result;
    });
    // POST /approvals - 创建审批项
    fastify.post('/', async (request, reply) => {
        const body = request.body;
        const approval = await createApproval(body);
        reply.status(201);
        return { approval };
    });
    // GET /approvals/:id - 获取审批项
    fastify.get('/:id', async (request, reply) => {
        const { id } = request.params;
        const approval = await getApproval(id);
        if (!approval) {
            reply.status(404);
            return { error: { message: 'Approval not found' } };
        }
        return { approval };
    });
    // POST /approvals/:id/process - 处理审批
    fastify.post('/:id/process', async (request, reply) => {
        const { id } = request.params;
        const body = request.body;
        try {
            const approval = await processApproval(id, body);
            if (!approval) {
                reply.status(404);
                return { error: { message: 'Approval not found' } };
            }
            return { approval };
        }
        catch (error) {
            reply.status(400);
            return {
                error: {
                    message: error instanceof Error ? error.message : 'Failed to process approval',
                },
            };
        }
    });
    // GET /approvals/stats - 获取统计信息
    fastify.get('/stats', async () => {
        const stats = getApprovalStats();
        return { stats };
    });
}
//# sourceMappingURL=approval.js.map