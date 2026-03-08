/**
 * 热重载 API 路由 (实验性)
 * Phase 1.6: 热重载系统
 *
 * 注意: 纯开发辅助功能，不应用于生产环境
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
} from '../../services/hotreload/store.js';
import { notFound, created, ok } from '../../utils/http-helpers.js';
import type {
  CreateConfigBundleRequest,
} from '@los-ast/shared/types';

/**
 * 注册 Hot Reload 路由 (实验性)
 */
export default async function hotReloadRoutes(fastify: FastifyInstance) {
  // GET /experimental/hotreload/bundles
  fastify.get('/bundles', async () =>
    ok(await listConfigBundles())
  );

  // POST /experimental/hotreload/bundles
  fastify.post('/bundles', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as CreateConfigBundleRequest;
    const bundle = await createConfigBundle(body);
    return created(reply, bundle);
  });

  // GET /experimental/hotreload/bundles/:id
  fastify.get('/bundles/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const bundle = await getConfigBundle(id);
    if (!bundle) return notFound(reply, 'Bundle');
    return ok(bundle);
  });

  // POST /experimental/hotreload/bundles/:id/validate
  fastify.post('/bundles/:id/validate', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { validator_id } = request.body as { validator_id: string };
    const bundle = await validateConfigBundle(id, validator_id);
    if (!bundle) return notFound(reply, 'Bundle');
    return ok(bundle);
  });

  // POST /experimental/hotreload/bundles/:id/activate
  fastify.post('/bundles/:id/activate', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const bundle = await activateConfigBundle(id);
    if (!bundle) return notFound(reply, 'Bundle');
    return ok(bundle);
  });

  // POST /experimental/hotreload/bundles/:id/rollback
  fastify.post('/bundles/:id/rollback', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const bundle = await rollbackConfigBundle(id);
    if (!bundle) return notFound(reply, 'Bundle');
    return ok(bundle);
  });

  // GET /experimental/hotreload/stats
  fastify.get('/stats', async () =>
    ok(getHotReloadStats())
  );
}
