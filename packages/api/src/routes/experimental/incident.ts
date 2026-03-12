/**
 * Incident API 路由 (实验性)
 * Phase 1.1: Incident 数据模型与采集系统
 *
 * 注意: 事故治理属于平台控制面职责，此路由将在 Milestone B 迁出至 VPS Agent Web
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createIncident,
  getIncidentWithScope,
  updateIncidentStatus,
  queryIncidents,
  getStoreStatsByScope,
} from '../../services/incident/store.js';
import {
  collectMetrics,
  collectLogs,
  evaluateTriggers,
  getCollectionStatsByScope,
} from '../../services/incident/collection.js';
import { NotFoundError, ValidationError } from '../../types/errors.js';
import type {
  CreateIncidentRequest,
  UpdateIncidentStatusRequest,
  IncidentQueryParams,
  CollectMetricsRequest,
  CollectLogsRequest,
  IncidentStatus,
  IncidentSeverity,
  IncidentSourceType,
} from '@los-ast/shared/types';

const requestScopeSchema = {
  type: 'object',
  properties: {
    tenant_id: { type: 'string' },
    project_id: { type: 'string' },
    actor_id: { type: 'string' },
    trace_id: { type: 'string' },
    mode: { type: 'string', enum: ['local', 'service'] },
  },
} as const;

const incidentSourceSchema = {
  type: 'object',
  required: ['type', 'detector_id', 'raw_payload'],
  additionalProperties: false,
  properties: {
    type: { type: 'string', enum: ['metric_alert', 'log_pattern', 'user_report'] },
    detector_id: { type: 'string', minLength: 1 },
    raw_payload: { type: 'object' },
  },
} as const;

const incidentImpactSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    services_affected: { type: 'array', items: { type: 'string' } },
    users_impacted: { type: 'integer', minimum: 0 },
    sla_breach_risk: { type: 'boolean' },
  },
} as const;

const createIncidentBodySchema = {
  type: 'object',
  required: ['title', 'description', 'severity', 'source'],
  additionalProperties: false,
  properties: {
    scope: requestScopeSchema,
    title: { type: 'string', minLength: 1 },
    description: { type: 'string', minLength: 1 },
    severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
    source: incidentSourceSchema,
    impact: incidentImpactSchema,
  },
} as const;

const updateIncidentStatusBodySchema = {
  type: 'object',
  required: ['status'],
  additionalProperties: false,
  properties: {
    scope: requestScopeSchema,
    status: { type: 'string', enum: ['detected', 'triaging', 'attributed', 'recovering', 'resolved', 'closed'] },
    comment: { type: 'string', minLength: 1 },
    actor_id: { type: 'string', minLength: 1 },
  },
} as const;

const metricDataPointSchema = {
  type: 'object',
  required: ['timestamp', 'metric_name', 'value', 'labels'],
  additionalProperties: false,
  properties: {
    timestamp: { type: 'string', minLength: 1 },
    metric_name: { type: 'string', minLength: 1 },
    value: { type: 'number' },
    labels: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
  },
} as const;

const logEntrySchema = {
  type: 'object',
  required: ['timestamp', 'level', 'message', 'service'],
  additionalProperties: false,
  properties: {
    timestamp: { type: 'string', minLength: 1 },
    level: { type: 'string', minLength: 1 },
    message: { type: 'string', minLength: 1 },
    service: { type: 'string', minLength: 1 },
    trace_id: { type: 'string' },
    span_id: { type: 'string' },
    metadata: { type: 'object' },
  },
} as const;

const collectMetricsBodySchema = {
  type: 'object',
  required: ['metrics'],
  additionalProperties: false,
  properties: {
    scope: requestScopeSchema,
    metrics: {
      type: 'array',
      minItems: 1,
      items: metricDataPointSchema,
    },
  },
} as const;

const collectLogsBodySchema = {
  type: 'object',
  required: ['logs'],
  additionalProperties: false,
  properties: {
    scope: requestScopeSchema,
    logs: {
      type: 'array',
      minItems: 1,
      items: logEntrySchema,
    },
  },
} as const;

const incidentIdParamsSchema = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1 },
  },
} as const;

// 查询参数验证函数
function parseIncidentStatus(value: string | undefined): IncidentStatus | undefined {
  if (!value) return undefined;
  const valid: IncidentStatus[] = ['detected', 'triaging', 'attributed', 'recovering', 'resolved', 'closed'];
  return valid.includes(value as IncidentStatus) ? (value as IncidentStatus) : undefined;
}

function parseIncidentSeverity(value: string | undefined): IncidentSeverity | undefined {
  if (!value) return undefined;
  const valid: IncidentSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
  return valid.includes(value as IncidentSeverity) ? (value as IncidentSeverity) : undefined;
}

function parseIncidentSourceType(value: string | undefined): IncidentSourceType | undefined {
  if (!value) return undefined;
  const valid: IncidentSourceType[] = ['metric_alert', 'log_pattern', 'user_report'];
  return valid.includes(value as IncidentSourceType) ? (value as IncidentSourceType) : undefined;
}

function parseQueryInt(value: string | undefined, defaultValue?: number): number | undefined {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * 注册 Incident 路由 (实验性)
 */
export default async function incidentRoutes(fastify: FastifyInstance) {
  // GET /experimental/incidents - 查询 Incidents
  fastify.get('/', async (request: FastifyRequest) => {
    const query = request.query as Record<string, string | undefined>;
    const scope = request.scope;

    if (!scope?.tenant_id || !scope?.project_id) {
      throw new ValidationError('MISSING_SCOPE', 'Request scope must include tenant_id and project_id');
    }

    const params: IncidentQueryParams = {
      tenant_id: scope.tenant_id,
      project_id: scope.project_id,
      status: parseIncidentStatus(query.status),
      severity: parseIncidentSeverity(query.severity),
      source_type: parseIncidentSourceType(query.source_type),
      from: query.from,
      to: query.to,
      limit: parseQueryInt(query.limit),
      offset: parseQueryInt(query.offset),
    };

    const result = await queryIncidents(params);
    return result;
  });

  // POST /experimental/incidents - 创建 Incident
  fastify.post('/', {
    schema: {
      body: createIncidentBodySchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as CreateIncidentRequest;
    const scope = request.scope;

    if (!scope?.tenant_id || !scope?.project_id) {
      throw new ValidationError('INCOMPLETE_SCOPE', 'Request scope must include tenant_id and project_id');
    }

    const incident = await createIncident({
      ...body,
      scope: {
        tenant_id: scope.tenant_id,
        project_id: scope.project_id,
        actor_id: scope.actor_id || body.scope?.actor_id || 'unknown',
        trace_id: body.scope?.trace_id || request.requestId,
      },
    });

    reply.status(201);
    return { incident };
  });

  // GET /experimental/incidents/:id - 获取单个 Incident
  fastify.get('/:id', {
    schema: {
      params: incidentIdParamsSchema,
    },
  }, async (request: FastifyRequest) => {
    const { id } = request.params as { id: string };
    const scope = request.scope;

    if (!scope?.tenant_id || !scope?.project_id) {
      throw new ValidationError('MISSING_SCOPE', 'Request scope must include tenant_id and project_id');
    }

    const incident = await getIncidentWithScope(id, scope.tenant_id, scope.project_id);

    if (!incident) {
      throw new NotFoundError('Incident', id);
    }

    return { incident };
  });

  // PATCH /experimental/incidents/:id/status - 更新 Incident 状态
  fastify.patch('/:id/status', {
    schema: {
      params: incidentIdParamsSchema,
      body: updateIncidentStatusBodySchema,
    },
  }, async (request: FastifyRequest) => {
    const { id } = request.params as { id: string };
    const body = request.body as UpdateIncidentStatusRequest;
    const scope = request.scope;

    if (!scope?.tenant_id || !scope?.project_id) {
      throw new ValidationError('MISSING_SCOPE', 'Request scope must include tenant_id and project_id');
    }

    // 先检查是否存在
    const existing = await getIncidentWithScope(id, scope.tenant_id, scope.project_id);
    if (!existing) {
      throw new NotFoundError('Incident', id);
    }

    const incident = await updateIncidentStatus(
      id,
      body.status,
      body.comment,
      scope.actor_id || body.actor_id
    );

    return { incident };
  });

  // POST /experimental/incidents/collect/metrics - 采集指标
  fastify.post('/collect/metrics', {
    schema: {
      body: collectMetricsBodySchema,
    },
  }, async (request: FastifyRequest) => {
    const body = request.body as CollectMetricsRequest;
    const scope = request.scope;

    if (!scope?.tenant_id || !scope?.project_id) {
      throw new ValidationError('MISSING_SCOPE', 'Request scope must include tenant_id and project_id');
    }

    const scopedPayload = {
      tenant_id: scope.tenant_id,
      project_id: scope.project_id,
      actor_id: scope.actor_id || body.scope?.actor_id || 'unknown',
      trace_id: body.scope?.trace_id || request.requestId,
    };

    await collectMetrics(scopedPayload, body.metrics);

    // 评估触发器
    const triggered = await evaluateTriggers(scopedPayload, body.metrics);

    return {
      collected: body.metrics.length,
      triggers_evaluated: triggered.length,
      triggered,
    };
  });

  // POST /experimental/incidents/collect/logs - 采集日志
  fastify.post('/collect/logs', {
    schema: {
      body: collectLogsBodySchema,
    },
  }, async (request: FastifyRequest) => {
    const body = request.body as CollectLogsRequest;
    const scope = request.scope;

    if (!scope?.tenant_id || !scope?.project_id) {
      throw new ValidationError('MISSING_SCOPE', 'Request scope must include tenant_id and project_id');
    }

    await collectLogs({
      tenant_id: scope.tenant_id,
      project_id: scope.project_id,
      actor_id: scope.actor_id || body.scope?.actor_id || 'unknown',
      trace_id: body.scope?.trace_id || request.requestId,
    }, body.logs);

    return {
      collected: body.logs.length,
    };
  });

  // GET /experimental/incidents/stats/store - 获取存储统计
  fastify.get('/stats/store', async (request: FastifyRequest) => {
    return getStoreStatsByScope({
      tenant_id: request.scope?.tenant_id,
      project_id: request.scope?.project_id,
    });
  });

  // GET /experimental/incidents/stats/collection - 获取采集统计
  fastify.get('/stats/collection', async (request: FastifyRequest) => {
    return getCollectionStatsByScope({
      tenant_id: request.scope?.tenant_id,
      project_id: request.scope?.project_id,
    });
  });
}
