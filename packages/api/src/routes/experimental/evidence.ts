/**
 * los-ast 证据生成 API 路由 (实验性)
 * Phase 1.7: los-ast 证据生成
 *
 * 注意: 此路由作为执行结果元数据能力，仅服务于单次执行
 * 不形成独立平台状态机
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  generateEvidence,
  getEvidenceBundle,
  validatePatchSafety,
  generateRewrite,
  explainCode,
  getCodeStats,
} from '../../services/evidence/service.js';
import { notFound, created, ok } from '../../utils/http-helpers.js';
import type {
  GenerateEvidenceRequest,
  ValidatePatchSafetyRequest,
  GenerateRewriteRequest,
  ExplainCodeRequest,
  VerifiedScope,
} from '@los-ast/shared/types';

/**
 * 注册 Evidence 路由 (实验性)
 */
export default async function evidenceRoutes(fastify: FastifyInstance) {
  fastify.post('/generate', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as GenerateEvidenceRequest;
    const scope = request.scope as VerifiedScope;
    const bundle = await generateEvidence(body, scope);
    return created(reply, bundle);
  });

  // GET /experimental/evidence/:id - 获取证据包
  fastify.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const scope = request.scope as VerifiedScope;
    const bundle = await getEvidenceBundle(id, scope);
    if (!bundle) return notFound(reply, 'Evidence bundle');
    return ok(bundle);
  });

  // POST /experimental/evidence/validate-patch - 验证 Patch 安全性
  fastify.post('/validate-patch', async (request: FastifyRequest) =>
    ok(await validatePatchSafety(request.body as ValidatePatchSafetyRequest))
  );

  // POST /experimental/evidence/rewrite - 生成改写候选
  fastify.post('/rewrite', async (request: FastifyRequest) =>
    ok(await generateRewrite(request.body as GenerateRewriteRequest))
  );

  // POST /experimental/evidence/explain - 解释代码
  fastify.post('/explain', async (request: FastifyRequest) =>
    ok(await explainCode(request.body as ExplainCodeRequest))
  );

  // GET /experimental/evidence/stats/:project - 获取代码统计
  fastify.get('/stats/:project', async (request: FastifyRequest) =>
    ok(await getCodeStats((request.params as { project: string }).project))
  );
}
