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
  getHypothesis,
  updateHypothesisStatus,
  queryHypotheses,
  createEvidenceBundle,
  getEvidenceBundle,
  getAttributionStats,
  saveAttributionAnalysis,
} from '../../services/attribution/store.js';
import { analyzeAttribution } from '../../services/attribution/provider.js';
import { NotFoundError } from '../../types/errors.js';
import type {
  CreateHypothesisRequest,
  UpdateHypothesisStatusRequest,
  CollectEvidenceRequest,
  HypothesisStatus,
} from '@los-ast/shared/types';

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
  fastify.post('/hypotheses', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as CreateHypothesisRequest;

    const hypothesis = await createHypothesis(body);

    reply.status(201);
    return { hypothesis };
  });

  // GET /experimental/attribution/hypotheses/:id - 获取假设
  fastify.get('/hypotheses/:id', async (request: FastifyRequest) => {
    const { id } = request.params as { id: string };

    const hypothesis = await getHypothesis(id);

    if (!hypothesis) {
      throw new NotFoundError('Hypothesis', id);
    }

    return { hypothesis };
  });

  // PATCH /experimental/attribution/hypotheses/:id/status - 更新假设状态
  fastify.patch('/hypotheses/:id/status', async (request: FastifyRequest) => {
    const { id } = request.params as { id: string };
    const body = request.body as UpdateHypothesisStatusRequest;

    // 先检查是否存在
    const existing = await getHypothesis(id);
    if (!existing) {
      throw new NotFoundError('Hypothesis', id);
    }

    const hypothesis = await updateHypothesisStatus(
      id,
      body.status,
      body.confidence,
      body.actor_id,
      body.reason
    );

    return { hypothesis };
  });

  // GET /experimental/attribution/hypotheses - 查询假设
  fastify.get('/hypotheses', async (request: FastifyRequest) => {
    const query = request.query as Record<string, string | undefined>;

    const result = await queryHypotheses({
      incident_id: query.incident_id,
      status: parseHypothesisStatus(query.status),
      category: query.category,
      limit: parseQueryInt(query.limit),
      offset: parseQueryInt(query.offset),
    });

    return result;
  });

  // POST /experimental/attribution/evidence - 创建证据包
  fastify.post('/evidence', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as CollectEvidenceRequest;

    // 创建证据项
    const evidenceItems = body.evidence_types.map((type) => ({
      item_id: `evd_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      type,
      source: `${type}_collector`,
      content: { collected: true },
      timestamp: new Date().toISOString(),
      metadata: {
        time_range: body.time_range,
        scope: body.scope,
      },
    }));

    const bundle = await createEvidenceBundle(body.incident_id, evidenceItems);

    reply.status(201);
    return { bundle };
  });

  // GET /experimental/attribution/evidence/:id - 获取证据包
  fastify.get('/evidence/:id', async (request: FastifyRequest) => {
    const { id } = request.params as { id: string };

    const bundle = await getEvidenceBundle(id);

    if (!bundle) {
      throw new NotFoundError('Evidence bundle', id);
    }

    return { bundle };
  });

  // POST /experimental/attribution/analyze - 执行归因分析
  fastify.post('/analyze', async (request: FastifyRequest) => {
    const body = request.body as {
      incident_id: string;
      evidence_bundle_id: string;
    };

    const analysis = await analyzeAttribution({
      incidentId: body.incident_id,
      evidenceBundleId: body.evidence_bundle_id,
      scope: request.scope,
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
