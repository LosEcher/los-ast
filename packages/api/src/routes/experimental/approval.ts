/**
 * 审批中心 API 路由 (实验性)
 * Phase 1.5: 审批中心工作流
 *
 * 注意: 审批流是控制面核心能力，此路由将在 Milestone B 迁出至 VPS Agent Web
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createApproval,
  getApprovalWithScope,
  processApproval,
  queryApprovals,
  getApprovalStats,
} from '../../services/approval/store.js';
import { NotFoundError, ValidationError } from '../../types/errors.js';
import { MemoryCache } from '../../utils/cache.js';

// 创建路由缓存实例 (30秒 TTL)
const statsCache = new MemoryCache({ defaultTtl: 30000, maxSize: 10 });
import type {
  CreateApprovalRequest,
  ProcessApprovalRequest,
  ApprovalQueryParams,
  ApprovalStatus,
  ApprovalItemType,
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

const approvalBodySchema = {
  type: 'object',
  required: ['item_type', 'item_id', 'title', 'description', 'risk_level', 'timeout_seconds'],
  additionalProperties: false,
  properties: {
    scope: scopeSchema,
    item_type: { type: 'string', enum: ['recovery_action', 'code_patch', 'config_change', 'recipe_activation'] },
    item_id: { type: 'string', minLength: 1 },
    title: { type: 'string', minLength: 1 },
    description: { type: 'string', minLength: 1 },
    risk_level: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
    timeout_seconds: { type: 'integer', minimum: 1 },
    metadata: { type: 'object' },
  },
} as const;

const processApprovalBodySchema = {
  type: 'object',
  required: ['action'],
  additionalProperties: false,
  properties: {
    scope: scopeSchema,
    action: { type: 'string', enum: ['approve', 'reject'] },
    actor_id: { type: 'string', minLength: 1 },
    comment: { type: 'string', minLength: 1 },
  },
} as const;

const approvalIdParamsSchema = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1 },
  },
} as const;

// 查询参数验证函数
function parseApprovalStatus(value: string | undefined): ApprovalStatus | undefined {
  if (!value) return undefined;
  const valid: ApprovalStatus[] = ['pending', 'approved', 'rejected', 'expired'];
  return valid.includes(value as ApprovalStatus) ? (value as ApprovalStatus) : undefined;
}

function parseApprovalItemType(value: string | undefined): ApprovalItemType | undefined {
  if (!value) return undefined;
  const valid: ApprovalItemType[] = ['recovery_action', 'code_patch', 'config_change', 'recipe_activation'];
  return valid.includes(value as ApprovalItemType) ? (value as ApprovalItemType) : undefined;
}

function parseQueryInt(value: string | undefined, defaultValue?: number): number | undefined {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * 注册 Approval 路由 (实验性)
 */
export default async function approvalRoutes(fastify: FastifyInstance) {
  // GET /experimental/approvals - 查询审批项
  fastify.get('/', async (request: FastifyRequest) => {
    const query = request.query as Record<string, string | undefined>;

    // 强制使用 request.scope 进行租户隔离，忽略 query 中的 tenant_id/project_id
    const scope = request.scope;
    if (!scope?.tenant_id || !scope?.project_id) {
      throw new ValidationError(
        'MISSING_SCOPE',
        'Request scope must include tenant_id and project_id'
      );
    }

    const params: ApprovalQueryParams = {
      tenant_id: scope.tenant_id,
      project_id: scope.project_id,
      status: parseApprovalStatus(query.status),
      risk_level: query.risk_level,
      item_type: parseApprovalItemType(query.item_type),
      limit: parseQueryInt(query.limit),
      offset: parseQueryInt(query.offset),
    };

    const result = await queryApprovals(params);
    return result;
  });

  // POST /experimental/approvals - 创建审批项
  fastify.post('/', {
    schema: {
      body: approvalBodySchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as CreateApprovalRequest;

    // 强制注入 request.scope，确保数据归属正确
    const scope = request.scope;
    if (!scope?.tenant_id || !scope?.project_id || !scope?.actor_id) {
      throw new ValidationError(
        'INCOMPLETE_SCOPE',
        'Request scope must include tenant_id, project_id, and actor_id'
      );
    }

    const approval = await createApproval({
      ...body,
      scope: {
        tenant_id: scope.tenant_id!,
        project_id: scope.project_id!,
      }, // 强制使用验证后的 scope
    }, scope.actor_id);

    reply.status(201);
    return { approval };
  });

  // GET /experimental/approvals/:id - 获取审批项
  fastify.get('/:id', {
    schema: {
      params: approvalIdParamsSchema,
    },
  }, async (request: FastifyRequest) => {
    const { id } = request.params as { id: string };

    // 强制使用 request.scope 进行租户边界校验
    const scope = request.scope;
    if (!scope?.tenant_id || !scope?.project_id) {
      throw new ValidationError(
        'MISSING_SCOPE',
        'Request scope must include tenant_id and project_id'
      );
    }

    // 使用 scope 校验版本，防止跨租户访问
    const approval = await getApprovalWithScope(id, scope.tenant_id, scope.project_id);

    if (!approval) {
      throw new NotFoundError('Approval', id);
    }

    return { approval };
  });

  // POST /experimental/approvals/:id/process - 处理审批
  fastify.post('/:id/process', {
    schema: {
      params: approvalIdParamsSchema,
      body: processApprovalBodySchema,
    },
  }, async (request: FastifyRequest) => {
    const { id } = request.params as { id: string };
    const body = request.body as ProcessApprovalRequest;

    // 强制使用 request.scope 进行租户边界校验
    const scope = request.scope;
    if (!scope?.tenant_id || !scope?.project_id) {
      throw new ValidationError(
        'MISSING_SCOPE',
        'Request scope must include tenant_id and project_id'
      );
    }

    // 使用 scope 校验版本，防止跨租户访问
    const existing = await getApprovalWithScope(id, scope.tenant_id, scope.project_id);
    if (!existing) {
      throw new NotFoundError('Approval', id);
    }

    const actorId = scope.actor_id || body.actor_id;
    if (!actorId) {
      throw new ValidationError(
        'MISSING_ACTOR_ID',
        'Approval processing requires a verified actor_id'
      );
    }

    try {
      const approval = await processApproval(id, {
        ...body,
        actor_id: actorId,
      });
      return { approval };
    } catch (error) {
      throw new ValidationError(
        'APPROVAL_PROCESS_FAILED',
        error instanceof Error ? error.message : 'Failed to process approval'
      );
    }
  });

  // GET /experimental/approvals/stats - 获取统计信息 (带缓存)
  fastify.get('/stats', async (request: FastifyRequest) => {
    // 强制使用 request.scope 进行租户隔离
    const scope = request.scope;
    if (!scope?.tenant_id || !scope?.project_id) {
      throw new ValidationError(
        'MISSING_SCOPE',
        'Request scope must include tenant_id and project_id'
      );
    }

    // 包含 scope 的缓存键，确保多租户隔离
    const cacheKey = `approval:stats:${scope.tenant_id}:${scope.project_id}`;

    // 尝试从缓存获取
    const cached = statsCache.get(cacheKey);
    if (cached !== undefined) {
      return { stats: cached };
    }

    // 获取新数据并缓存 (按 scope 过滤)
    const stats = getApprovalStats(scope.tenant_id, scope.project_id);
    statsCache.set(cacheKey, stats, 30000);
    return { stats };
  });
}
