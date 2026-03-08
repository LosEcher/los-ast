/**
 * 自动恢复 API 路由 (实验性)
 * Phase 1.4: L1/L2 自动恢复系统
 *
 * 注意: 恢复决策需要全局上下文，此路由将在 Milestone B 迁出至 VPS Agent Web
 */
import { createRecoveryAction, getRecoveryAction, updateRecoveryActionStatus, startRecoveryAction, executeL1Action, executeL2Action, queryRecoveryActions, createRecoveryPolicy, getRecoveryPolicy, listRecoveryPolicies, getRecoveryStats, } from '../../services/recovery/store.js';
import { NotFoundError, ValidationError } from '../../types/errors.js';
/**
 * 注册 Recovery 路由 (实验性)
 */
export default async function recoveryRoutes(fastify) {
    // POST /experimental/recovery/actions - 创建并执行恢复动作
    fastify.post('/actions', async (request, reply) => {
        const body = request.body;
        // 创建动作
        const action = await createRecoveryAction(body);
        // 如果不需要审批，立即执行
        if (!action.safety.requires_approval) {
            await startRecoveryAction(action.action_id);
            if (action.level === 'L1_harmless') {
                const result = await executeL1Action(action);
                await updateRecoveryActionStatus(action.action_id, result.success ? 'succeeded' : 'failed', result);
            }
            else if (action.level === 'L2_controlled') {
                const result = await executeL2Action(action);
                await updateRecoveryActionStatus(action.action_id, result.success ? 'succeeded' : 'failed', result);
            }
        }
        // 获取最新状态
        const finalAction = await getRecoveryAction(action.action_id);
        reply.status(201);
        return {
            action: finalAction,
            message: action.safety.requires_approval
                ? 'Recovery action pending approval'
                : 'Recovery action executed',
        };
    });
    // GET /experimental/recovery/actions - 查询恢复动作
    fastify.get('/actions', async (request) => {
        const query = request.query;
        const result = await queryRecoveryActions({
            incident_id: query.incident_id,
            status: query.status,
            level: query.level,
            limit: query.limit ? parseInt(query.limit, 10) : undefined,
            offset: query.offset ? parseInt(query.offset, 10) : undefined,
        });
        return result;
    });
    // GET /experimental/recovery/actions/:id - 获取恢复动作
    fastify.get('/actions/:id', async (request) => {
        const { id } = request.params;
        const action = await getRecoveryAction(id);
        if (!action) {
            throw new NotFoundError('Recovery action', id);
        }
        return { action };
    });
    // POST /experimental/recovery/actions/:id/approve - 审批恢复动作
    fastify.post('/actions/:id/approve', async (request) => {
        const { id } = request.params;
        const action = await getRecoveryAction(id);
        if (!action) {
            throw new NotFoundError('Recovery action', id);
        }
        if (action.status !== 'pending_approval') {
            throw new ValidationError('INVALID_STATUS', 'Action is not pending approval');
        }
        // 更新状态为已审批
        await updateRecoveryActionStatus(id, 'approved');
        // 开始执行
        await startRecoveryAction(id);
        // 执行动作
        if (action.level === 'L1_harmless') {
            const result = await executeL1Action(action);
            await updateRecoveryActionStatus(id, result.success ? 'succeeded' : 'failed', result);
        }
        else if (action.level === 'L2_controlled') {
            const result = await executeL2Action(action);
            await updateRecoveryActionStatus(id, result.success ? 'succeeded' : 'failed', result);
        }
        const finalAction = await getRecoveryAction(id);
        return { action: finalAction };
    });
    // POST /experimental/recovery/actions/:id/rollback - 回滚恢复动作
    fastify.post('/actions/:id/rollback', async (request) => {
        const { id } = request.params;
        const { actor_id, reason } = request.body;
        const action = await getRecoveryAction(id);
        if (!action) {
            throw new NotFoundError('Recovery action', id);
        }
        // 更新状态为已回滚
        await updateRecoveryActionStatus(id, 'rolled_back', {
            success: true,
            output: `Rolled back by ${actor_id}: ${reason}`,
            duration_ms: 0,
        });
        const finalAction = await getRecoveryAction(id);
        return { action: finalAction };
    });
    // POST /experimental/recovery/policies - 创建恢复策略
    fastify.post('/policies', async (request, reply) => {
        const body = request.body;
        const policy = await createRecoveryPolicy({
            ...body,
            require_approval_threshold: body.level === 'L1_harmless' ? undefined : {
                estimated_downtime_seconds: 60,
                affected_services: 1,
            },
        });
        reply.status(201);
        return { policy };
    });
    // GET /experimental/recovery/policies - 列出恢复策略
    fastify.get('/policies', async () => {
        const policies = await listRecoveryPolicies();
        return { policies };
    });
    // GET /experimental/recovery/policies/:id - 获取恢复策略
    fastify.get('/policies/:id', async (request) => {
        const { id } = request.params;
        const policy = await getRecoveryPolicy(id);
        if (!policy) {
            throw new NotFoundError('Recovery policy', id);
        }
        return { policy };
    });
    // GET /experimental/recovery/stats - 获取统计信息
    fastify.get('/stats', async () => {
        const stats = getRecoveryStats();
        return { stats };
    });
}
//# sourceMappingURL=recovery.js.map