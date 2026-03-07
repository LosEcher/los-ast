/**
 * los-ast 证据生成 API 路由
 * Phase 1.7: los-ast 证据生成
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  generateEvidence,
  getEvidenceBundle,
  validatePatchSafety,
  generateRewrite,
  explainCode,
  getCodeStats,
} from '../services/evidence/service.js';
import type {
  GenerateEvidenceRequest,
  ValidatePatchSafetyRequest,
  GenerateRewriteRequest,
  ExplainCodeRequest,
} from '@los-ast/shared/types';

export default async function evidenceRoutes(fastify: FastifyInstance) {
  // POST /evidence/generate - 生成证据包
  fastify.post('/generate', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as GenerateEvidenceRequest;
    const bundle = await generateEvidence(body);
    reply.status(201);
    return { bundle };
  });

  // GET /evidence/:id - 获取证据包
  fastify.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const bundle = await getEvidenceBundle(id);
    if (!bundle) {
      reply.status(404);
      return { error: { message: 'Evidence bundle not found' } };
    }
    return { bundle };
  });

  // POST /evidence/validate-patch - 验证 Patch 安全性
  fastify.post('/validate-patch', async (request: FastifyRequest) => {
    const body = request.body as ValidatePatchSafetyRequest;
    const result = await validatePatchSafety(body);
    return { result };
  });

  // POST /evidence/rewrite - 生成改写候选
  fastify.post('/rewrite', async (request: FastifyRequest) => {
    const body = request.body as GenerateRewriteRequest;
    const result = await generateRewrite(body);
    return { result };
  });

  // POST /evidence/explain - 解释代码
  fastify.post('/explain', async (request: FastifyRequest) => {
    const body = request.body as ExplainCodeRequest;
    const result = await explainCode(body);
    return { result };
  });

  // GET /evidence/stats/:project - 获取代码统计
  fastify.get('/stats/:project', async (request: FastifyRequest) => {
    const { project } = request.params as { project: string };
    const stats = await getCodeStats(project);
    return { stats };
  });
}
