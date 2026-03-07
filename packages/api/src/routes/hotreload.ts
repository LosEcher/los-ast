/**
 * 热重载 API 路由
 * Phase 1.6: 热重载系统
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createConfigBundle,
  getConfigBundle,
  validateConfigBundle,
  activateConfigBundle,
  rollbackConfigBundle,
  listConfigBundles,
  getHotReloadStats,
} from '../services/hotreload/store.js';
import type {
  CreateConfigBundleRequest,
} from '@los-ast/shared/types';

export default async function hotReloadRoutes(fastify: FastifyInstance) {
  // GET /hotreload/bundles
  fastify.get('/bundles', async () => {
    const bundles = await listConfigBundles();
    return { bundles };
  });

  // POST /hotreload/bundles
  fastify.post('/bundles', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as CreateConfigBundleRequest;
    const bundle = await createConfigBundle(body);
    reply.status(201);
    return { bundle };
  });

  // GET /hotreload/bundles/:id
  fastify.get('/bundles/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const bundle = await getConfigBundle(id);
    if (!bundle) {
      reply.status(404);
      return { error: { message: 'Bundle not found' } };
    }
    return { bundle };
  });

  // POST /hotreload/bundles/:id/validate
  fastify.post('/bundles/:id/validate', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { validator_id } = request.body as { validator_id: string };
    const bundle = await validateConfigBundle(id, validator_id);
    if (!bundle) {
      reply.status(404);
      return { error: { message: 'Bundle not found' } };
    }
    return { bundle };
  });

  // POST /hotreload/bundles/:id/activate
  fastify.post('/bundles/:id/activate', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const bundle = await activateConfigBundle(id);
    if (!bundle) {
      reply.status(404);
      return { error: { message: 'Bundle not found' } };
    }
    return { bundle };
  });

  // POST /hotreload/bundles/:id/rollback
  fastify.post('/bundles/:id/rollback', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const bundle = await rollbackConfigBundle(id);
    if (!bundle) {
      reply.status(404);
      return { error: { message: 'Bundle not found' } };
    }
    return { bundle };
  });

  // GET /hotreload/stats
  fastify.get('/stats', async () => {
    const stats = getHotReloadStats();
    return { stats };
  });
}
