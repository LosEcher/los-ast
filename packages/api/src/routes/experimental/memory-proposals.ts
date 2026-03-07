/**
 * los-memory API 路由 (实验性)
 * Phase 1.2: 经验提案 (candidate/proposal 语义，不直接决定入账)
 *
 * 注意: 此路由仅表达"提案/候选"，最终写入决策由 los-memory 或上层控制面决定
 * 避免侵蚀 los-memory sovereignty
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createProposal,
  getProposal,
  validateProposal,
  queryKnowledge,
  getRecoveryRecipe,
  findMatchingRecipes,
  getIncidentLesson,
  getMemoryStats,
} from '../../services/memory/store.js';
import type {
  CreateProposalRequest,
  ValidateProposalRequest,
  KnowledgeQuery,
} from '@los-ast/shared/types';

/**
 * 注册 Memory Proposals 路由 (实验性)
 */
export default async function memoryProposalsRoutes(fastify: FastifyInstance) {
  // POST /experimental/memory-proposals/proposals - 创建提案
  fastify.post('/proposals', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as CreateProposalRequest;

    const proposal = await createProposal(body);

    reply.status(201);
    return { proposal };
  });

  // GET /experimental/memory-proposals/proposals/:id - 获取提案
  fastify.get('/proposals/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const proposal = await getProposal(id);

    if (!proposal) {
      reply.status(404);
      return { error: { message: 'Proposal not found' } };
    }

    return { proposal };
  });

  // POST /experimental/memory-proposals/proposals/:id/validate - 验证提案
  fastify.post('/proposals/:id/validate', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as ValidateProposalRequest;

    const proposal = await validateProposal(id, body.validator_id, body.approve, body.rejection_reason);

    if (!proposal) {
      reply.status(404);
      return { error: { message: 'Proposal not found' } };
    }

    return { proposal };
  });

  // GET /experimental/memory-proposals/knowledge - 查询知识库
  fastify.get('/knowledge', async (request: FastifyRequest) => {
    const query = request.query as Record<string, string | undefined>;

    const params: KnowledgeQuery = {
      type: query.type as any,
      scope: {
        tenant_id: query.tenant_id,
        project_id: query.project_id,
      },
      tags: query.tags?.split(','),
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
      offset: query.offset ? parseInt(query.offset, 10) : undefined,
    };

    const result = await queryKnowledge(params);
    return result;
  });

  // GET /experimental/memory-proposals/recipes/:id - 获取恢复方案
  fastify.get('/recipes/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const recipe = await getRecoveryRecipe(id);

    if (!recipe) {
      reply.status(404);
      return { error: { message: 'Recipe not found' } };
    }

    return { recipe };
  });

  // POST /experimental/memory-proposals/recipes/find - 查找匹配的恢复方案
  fastify.post('/recipes/find', async (request: FastifyRequest) => {
    const body = request.body as {
      tenant_id: string;
      project_id: string;
      keywords: string[];
    };

    const recipes = await findMatchingRecipes(body.tenant_id, body.project_id, body.keywords);
    return { recipes };
  });

  // GET /experimental/memory-proposals/lessons/:id - 获取事件教训
  fastify.get('/lessons/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const lesson = await getIncidentLesson(id);

    if (!lesson) {
      reply.status(404);
      return { error: { message: 'Lesson not found' } };
    }

    return { lesson };
  });

  // GET /experimental/memory-proposals/stats - 获取统计信息
  fastify.get('/stats', async () => {
    const stats = await getMemoryStats();
    return { stats };
  });
}
