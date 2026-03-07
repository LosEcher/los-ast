/**
 * Incident API 路由 (实验性)
 * Phase 1.1: Incident 数据模型与采集系统
 *
 * 注意: 事故治理属于平台控制面职责，此路由将在 Milestone B 迁出至 VPS Agent Web
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createIncident,
  getIncident,
  updateIncidentStatus,
  queryIncidents,
  getStoreStats,
} from '../../services/incident/store.js';
import {
  collectMetrics,
  collectLogs,
  evaluateTriggers,
  getCollectionStats,
} from '../../services/incident/collection.js';
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

    const params: IncidentQueryParams = {
      tenant_id: query.tenant_id,
      project_id: query.project_id,
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
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as CreateIncidentRequest;

    const incident = await createIncident(body);

    reply.status(201);
    return { incident };
  });

  // GET /experimental/incidents/:id - 获取单个 Incident
  fastify.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const incident = await getIncident(id);

    if (!incident) {
      reply.status(404);
      return { error: { message: 'Incident not found' } };
    }

    return { incident };
  });

  // PATCH /experimental/incidents/:id/status - 更新 Incident 状态
  fastify.patch('/:id/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as UpdateIncidentStatusRequest;

    const incident = await updateIncidentStatus(
      id,
      body.status,
      body.comment,
      body.actor_id
    );

    if (!incident) {
      reply.status(404);
      return { error: { message: 'Incident not found' } };
    }

    return { incident };
  });

  // POST /experimental/incidents/collect/metrics - 采集指标
  fastify.post('/collect/metrics', async (request: FastifyRequest) => {
    const body = request.body as CollectMetricsRequest;

    await collectMetrics(body.scope, body.metrics);

    // 评估触发器
    const triggered = await evaluateTriggers(body.scope, body.metrics);

    return {
      collected: body.metrics.length,
      triggers_evaluated: triggered.length,
      triggered,
    };
  });

  // POST /experimental/incidents/collect/logs - 采集日志
  fastify.post('/collect/logs', async (request: FastifyRequest) => {
    const body = request.body as CollectLogsRequest;

    await collectLogs(body.scope, body.logs);

    return {
      collected: body.logs.length,
    };
  });

  // GET /experimental/incidents/stats/store - 获取存储统计
  fastify.get('/stats/store', async () => {
    return getStoreStats();
  });

  // GET /experimental/incidents/stats/collection - 获取采集统计
  fastify.get('/stats/collection', async () => {
    return getCollectionStats();
  });
}
