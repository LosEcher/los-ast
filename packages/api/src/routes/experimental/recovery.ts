/**
 * 自动恢复 API 路由 (实验性)
 * Phase 1.4: L1/L2 自动恢复系统
 *
 * 注意: 恢复决策需要全局上下文，此路由将在 Milestone B 迁出至 VPS Agent Web
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createRecoveryAction,
  getRecoveryAction,
  getRecoveryActionWithScope,
  updateRecoveryActionStatus,
  startRecoveryAction,
  executeL1Action,
  executeL2Action,
  queryRecoveryActions,
  createRecoveryPolicy,
  getRecoveryPolicy,
  listRecoveryPolicies,
  getRecoveryStats,
} from '../../services/recovery/store.js';
import { NotFoundError, ValidationError } from '../../types/errors.js';
import { getIncidentWithScope } from '../../services/incident/store.js';
import type {
  ExecuteRecoveryActionRequest,
  RollbackRequest,
  RecoveryActionStatus,
} from '@los-ast/shared/types';

const scopeSchema = {
  type: 'object',
  properties: {
    tenant_id: { type: 'string' },
    project_id: { type: 'string' },
    actor_id: { type: 'string' },
    mode: { type: 'string', enum: ['local', 'service'] },
  },
} as const;

const recoveryActionBodySchema = {
  type: 'object',
  required: ['incident_id', 'hypothesis_id', 'level', 'type', 'parameters'],
  additionalProperties: false,
  properties: {
    scope: scopeSchema,
    incident_id: { type: 'string', minLength: 1 },
    hypothesis_id: { type: 'string', minLength: 1 },
    level: { type: 'string', enum: ['L1_harmless', 'L2_controlled', 'L3_code_level'] },
    type: { type: 'string', enum: ['restart', 'rollback', 'circuit_breaker', 'feature_toggle', 'code_patch'] },
    parameters: { type: 'object' },
    actor_id: { type: 'string', minLength: 1 },
  },
} as const;

const rollbackBodySchema = {
  type: 'object',
  required: ['reason'],
  additionalProperties: false,
  properties: {
    scope: scopeSchema,
    actor_id: { type: 'string', minLength: 1 },
    reason: { type: 'string', minLength: 1 },
  },
} as const;

const actionIdParamsSchema = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1 },
  },
} as const;

/**
 * 注册 Recovery 路由 (实验性)
 */
export default async function recoveryRoutes(fastify: FastifyInstance) {
  // POST /experimental/recovery/actions - 创建并执行恢复动作
  fastify.post('/actions', {
    schema: {
      body: recoveryActionBodySchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as ExecuteRecoveryActionRequest;
    const scope = request.scope;

    if (!scope?.tenant_id || !scope?.project_id) {
      throw new ValidationError('INCOMPLETE_SCOPE', 'Request scope must include tenant_id and project_id');
    }

    const incident = await getIncidentWithScope(body.incident_id, scope.tenant_id, scope.project_id);
    if (!incident) {
      throw new NotFoundError('Incident', body.incident_id);
    }

    // 创建动作
    const action = await createRecoveryAction({
      ...body,
      actor_id: scope.actor_id || body.actor_id,
    }, {
      tenant_id: incident.scope.tenant_id,
      project_id: incident.scope.project_id,
    });

    // 如果不需要审批，立即执行
    if (!action.safety.requires_approval) {
      await startRecoveryAction(action.action_id);

      if (action.level === 'L1_harmless') {
        const result = await executeL1Action(action);
        await updateRecoveryActionStatus(
          action.action_id,
          result.success ? 'succeeded' : 'failed',
          result
        );
      } else if (action.level === 'L2_controlled') {
        const result = await executeL2Action(action);
        await updateRecoveryActionStatus(
          action.action_id,
          result.success ? 'succeeded' : 'failed',
          result
        );
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
  fastify.get('/actions', async (request: FastifyRequest) => {
    const query = request.query as Record<string, string | undefined>;
    const scope = request.scope;

    if (!scope?.tenant_id || !scope?.project_id) {
      throw new ValidationError('MISSING_SCOPE', 'Request scope must include tenant_id and project_id');
    }

    const result = await queryRecoveryActions({
      incident_id: query.incident_id,
      status: query.status as RecoveryActionStatus,
      level: query.level,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
      offset: query.offset ? parseInt(query.offset, 10) : undefined,
      scope: {
        tenant_id: scope.tenant_id,
        project_id: scope.project_id,
      },
    });

    return result;
  });

  // GET /experimental/recovery/actions/:id - 获取恢复动作
  fastify.get('/actions/:id', async (request: FastifyRequest) => {
    const { id } = request.params as { id: string };
    const scope = request.scope;

    if (!scope?.tenant_id || !scope?.project_id) {
      throw new ValidationError('MISSING_SCOPE', 'Request scope must include tenant_id and project_id');
    }

    const action = await getRecoveryActionWithScope(id, scope.tenant_id, scope.project_id);

    if (!action) {
      throw new NotFoundError('Recovery action', id);
    }

    return { action };
  });

  // POST /experimental/recovery/actions/:id/approve - 审批恢复动作
  fastify.post('/actions/:id/approve', {
    schema: {
      params: actionIdParamsSchema,
    },
  }, async (request: FastifyRequest) => {
    const { id } = request.params as { id: string };
    const scope = request.scope;

    if (!scope?.tenant_id || !scope?.project_id) {
      throw new ValidationError('MISSING_SCOPE', 'Request scope must include tenant_id and project_id');
    }

    const action = await getRecoveryActionWithScope(id, scope.tenant_id, scope.project_id);

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
    } else if (action.level === 'L2_controlled') {
      const result = await executeL2Action(action);
      await updateRecoveryActionStatus(id, result.success ? 'succeeded' : 'failed', result);
    }

    const finalAction = await getRecoveryAction(id);
    return { action: finalAction };
  });

  // POST /experimental/recovery/actions/:id/rollback - 回滚恢复动作
  fastify.post('/actions/:id/rollback', {
    schema: {
      params: actionIdParamsSchema,
      body: rollbackBodySchema,
    },
  }, async (request: FastifyRequest) => {
    const { id } = request.params as { id: string };
    const { actor_id, reason } = request.body as RollbackRequest;
    const scope = request.scope;

    if (!scope?.tenant_id || !scope?.project_id) {
      throw new ValidationError('MISSING_SCOPE', 'Request scope must include tenant_id and project_id');
    }

    const action = await getRecoveryActionWithScope(id, scope.tenant_id, scope.project_id);

    if (!action) {
      throw new NotFoundError('Recovery action', id);
    }

    // 更新状态为已回滚
    await updateRecoveryActionStatus(id, 'rolled_back', {
      success: true,
      output: `Rolled back by ${scope.actor_id || actor_id}: ${reason}`,
      duration_ms: 0,
    });

    const finalAction = await getRecoveryAction(id);
    return { action: finalAction };
  });

  // POST /experimental/recovery/policies - 创建恢复策略
  fastify.post('/policies', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      name: string;
      level: 'L1_harmless' | 'L2_controlled' | 'L3_code_level';
      auto_execute: boolean;
      allowed_actions: ('restart' | 'rollback' | 'circuit_breaker' | 'feature_toggle' | 'code_patch')[];
      cooldown_seconds: number;
    };

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
  fastify.get('/policies/:id', async (request: FastifyRequest) => {
    const { id } = request.params as { id: string };

    const policy = await getRecoveryPolicy(id);

    if (!policy) {
      throw new NotFoundError('Recovery policy', id);
    }

    return { policy };
  });

  // GET /experimental/recovery/stats - 获取统计信息
  fastify.get('/stats', async (request: FastifyRequest) => {
    const stats = getRecoveryStats({
      tenant_id: request.scope?.tenant_id,
      project_id: request.scope?.project_id,
    });
    return { stats };
  });
}
