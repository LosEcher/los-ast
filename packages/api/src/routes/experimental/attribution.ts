/**
 * 故障归因 API 路由 (实验性)
 * Phase 1.3: 故障归因系统
 *
 * 注意: 此路由作为执行结果来源解释，仅服务于单次执行元数据
 * 不形成独立平台状态机，不承担跨项目治理职责
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createHypothesis,
  getHypothesisWithScope,
  updateHypothesisStatus,
  queryHypotheses,
  createEvidenceBundle,
  getEvidenceBundleWithScope,
  getAttributionStats,
  saveAttributionAnalysis,
} from '../../services/attribution/store.js';
import { analyzeAttribution } from '../../services/attribution/provider.js';
import { NotFoundError, ValidationError } from '../../types/errors.js';
import { getIncidentWithScope } from '../../services/incident/store.js';
import type {
  AttributionRequest,
  CreateHypothesisRequest,
  UpdateHypothesisStatusRequest,
  CollectEvidenceRequest,
  HypothesisStatus,
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

const hypothesisBodySchema = {
  type: 'object',
  required: ['incident_id', 'title', 'description', 'category', 'root_cause', 'evidence_bundle_id'],
  additionalProperties: false,
  properties: {
    scope: scopeSchema,
    incident_id: { type: 'string', minLength: 1 },
    title: { type: 'string', minLength: 1 },
    description: { type: 'string', minLength: 1 },
    category: { type: 'string', enum: ['code_defect', 'config_error', 'infrastructure', 'dependency_failure'] },
    root_cause: {
      type: 'object',
      required: ['component', 'description'],
      additionalProperties: false,
      properties: {
        component: { type: 'string', minLength: 1 },
        location: { type: 'string' },
        commit_sha: { type: 'string' },
        pattern_id: { type: 'string' },
        description: { type: 'string', minLength: 1 },
      },
    },
    evidence_bundle_id: { type: 'string', minLength: 1 },
    proposed_by: { type: 'string', minLength: 1 },
  },
} as const;

const hypothesisStatusBodySchema = {
  type: 'object',
  required: ['status'],
  additionalProperties: false,
  properties: {
    scope: scopeSchema,
    status: { type: 'string', enum: ['proposed', 'validating', 'confirmed', 'rejected', 'superseded'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    actor_id: { type: 'string', minLength: 1 },
    reason: { type: 'string', minLength: 1 },
  },
} as const;

const evidenceBodySchema = {
  type: 'object',
  required: ['incident_id', 'evidence_types', 'time_range'],
  additionalProperties: false,
  properties: {
    scope: scopeSchema,
    incident_id: { type: 'string', minLength: 1 },
    evidence_types: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', enum: ['log', 'metric', 'trace', 'code', 'config'] },
    },
    time_range: {
      type: 'object',
      required: ['from', 'to'],
      additionalProperties: false,
      properties: {
        from: { type: 'string', minLength: 1 },
        to: { type: 'string', minLength: 1 },
      },
    },
  },
} as const;

const analyzeBodySchema = {
  type: 'object',
  required: ['incident_id', 'evidence_bundle_id'],
  additionalProperties: false,
  properties: {
    scope: scopeSchema,
    incident_id: { type: 'string', minLength: 1 },
    evidence_bundle_id: { type: 'string', minLength: 1 },
  },
} as const;

const idParamsSchema = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1 },
  },
} as const;

// 查询参数验证函数
function parseHypothesisStatus(value: string | undefined): HypothesisStatus | undefined {
  if (!value) return undefined;
  const valid: HypothesisStatus[] = ['proposed', 'validating', 'confirmed', 'rejected', 'superseded'];
  return valid.includes(value as HypothesisStatus) ? (value as HypothesisStatus) : undefined;
}

function parseQueryInt(value: string | undefined, defaultValue?: number): number | undefined {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * 注册 Attribution 路由 (实验性)
 */
export default async function attributionRoutes(fastify: FastifyInstance) {
  // POST /experimental/attribution/hypotheses - 创建假设
  fastify.post('/hypotheses', {
    schema: {
      body: hypothesisBodySchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as CreateHypothesisRequest;
    const scope = request.scope;

    if (!scope?.tenant_id || !scope?.project_id) {
      throw new ValidationError('INCOMPLETE_SCOPE', 'Request scope must include tenant_id and project_id');
    }

    const incident = await getIncidentWithScope(body.incident_id, scope.tenant_id, scope.project_id);
    if (!incident) {
      throw new NotFoundError('Incident', body.incident_id);
    }

    const evidenceBundle = await getEvidenceBundleWithScope(body.evidence_bundle_id, scope);
    if (!evidenceBundle) {
      throw new NotFoundError('Evidence bundle', body.evidence_bundle_id);
    }

    const hypothesis = await createHypothesis({
      ...body,
      incident_id: incident.incident_id,
      proposed_by: scope.actor_id || body.proposed_by,
    });

    reply.status(201);
    return { hypothesis };
  });

  // GET /experimental/attribution/hypotheses/:id - 获取假设
  fastify.get('/hypotheses/:id', {
    schema: {
      params: idParamsSchema,
    },
  }, async (request: FastifyRequest) => {
    const { id } = request.params as { id: string };
    const scope = request.scope;

    if (!scope?.tenant_id || !scope?.project_id) {
      throw new ValidationError('MISSING_SCOPE', 'Request scope must include tenant_id and project_id');
    }

    const hypothesis = await getHypothesisWithScope(id, scope);

    if (!hypothesis) {
      throw new NotFoundError('Hypothesis', id);
    }

    return { hypothesis };
  });

  // PATCH /experimental/attribution/hypotheses/:id/status - 更新假设状态
  fastify.patch('/hypotheses/:id/status', {
    schema: {
      params: idParamsSchema,
      body: hypothesisStatusBodySchema,
    },
  }, async (request: FastifyRequest) => {
    const { id } = request.params as { id: string };
    const body = request.body as UpdateHypothesisStatusRequest;
    const scope = request.scope;

    if (!scope?.tenant_id || !scope?.project_id) {
      throw new ValidationError('MISSING_SCOPE', 'Request scope must include tenant_id and project_id');
    }

    // 先检查是否存在
    const existing = await getHypothesisWithScope(id, scope);
    if (!existing) {
      throw new NotFoundError('Hypothesis', id);
    }

    const hypothesis = await updateHypothesisStatus(
      id,
      body.status,
      body.confidence,
      scope.actor_id || body.actor_id,
      body.reason
    );

    return { hypothesis };
  });

  // GET /experimental/attribution/hypotheses - 查询假设
  fastify.get('/hypotheses', async (request: FastifyRequest) => {
    const query = request.query as Record<string, string | undefined>;
    const scope = request.scope;

    if (!scope?.tenant_id || !scope?.project_id) {
      throw new ValidationError('MISSING_SCOPE', 'Request scope must include tenant_id and project_id');
    }

    const result = await queryHypotheses({
      incident_id: query.incident_id,
      status: parseHypothesisStatus(query.status),
      category: query.category,
      limit: parseQueryInt(query.limit),
      offset: parseQueryInt(query.offset),
      scope: {
        tenant_id: scope.tenant_id,
        project_id: scope.project_id,
      },
    });

    return result;
  });

  // POST /experimental/attribution/evidence - 创建证据包
  fastify.post('/evidence', {
    schema: {
      body: evidenceBodySchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as CollectEvidenceRequest;
    const scope = request.scope;

    if (!scope?.tenant_id || !scope?.project_id) {
      throw new ValidationError('INCOMPLETE_SCOPE', 'Request scope must include tenant_id and project_id');
    }

    const incident = await getIncidentWithScope(body.incident_id, scope.tenant_id, scope.project_id);
    if (!incident) {
      throw new NotFoundError('Incident', body.incident_id);
    }

    // 创建证据项
    const evidenceItems = body.evidence_types.map((type) => ({
      item_id: `evd_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      type,
      source: `${type}_collector`,
      content: { collected: true },
      timestamp: new Date().toISOString(),
      metadata: {
        time_range: body.time_range,
        scope: {
          tenant_id: scope.tenant_id,
          project_id: scope.project_id,
        },
      },
    }));

    const bundle = await createEvidenceBundle(incident.incident_id, evidenceItems);

    reply.status(201);
    return { bundle };
  });

  // GET /experimental/attribution/evidence/:id - 获取证据包
  fastify.get('/evidence/:id', {
    schema: {
      params: idParamsSchema,
    },
  }, async (request: FastifyRequest) => {
    const { id } = request.params as { id: string };
    const scope = request.scope;

    if (!scope?.tenant_id || !scope?.project_id) {
      throw new ValidationError('MISSING_SCOPE', 'Request scope must include tenant_id and project_id');
    }

    const bundle = await getEvidenceBundleWithScope(id, scope);

    if (!bundle) {
      throw new NotFoundError('Evidence bundle', id);
    }

    return { bundle };
  });

  // POST /experimental/attribution/analyze - 执行归因分析
  fastify.post('/analyze', {
    schema: {
      body: analyzeBodySchema,
    },
  }, async (request: FastifyRequest) => {
    const body = request.body as AttributionRequest;
    const scope = request.scope;

    if (!scope?.tenant_id || !scope?.project_id) {
      throw new ValidationError('MISSING_SCOPE', 'Request scope must include tenant_id and project_id');
    }

    const incident = await getIncidentWithScope(body.incident_id, scope.tenant_id, scope.project_id);
    if (!incident) {
      throw new NotFoundError('Incident', body.incident_id);
    }

    const bundle = await getEvidenceBundleWithScope(body.evidence_bundle_id, scope);
    if (!bundle) {
      throw new NotFoundError('Evidence bundle', body.evidence_bundle_id);
    }

    const analysis = await analyzeAttribution({
      incidentId: incident.incident_id,
      evidenceBundleId: bundle.bundle_id,
      scope,
    });
    await saveAttributionAnalysis(analysis);

    return { analysis };
  });

  // GET /experimental/attribution/stats - 获取统计信息
  fastify.get('/stats', async (request: FastifyRequest) => {
    const stats = getAttributionStats({
      tenant_id: request.scope?.tenant_id,
      project_id: request.scope?.project_id,
    });
    return { stats };
  });
}
