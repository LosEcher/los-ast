/**
 * 热重载 API 路由 (实验性)
 * Phase 1.6: 热重载系统
 *
 * 注意: 纯开发辅助功能，不应用于生产环境
 */
import { createConfigBundle, getConfigBundle, validateConfigBundle, activateConfigBundle, rollbackConfigBundle, listConfigBundles, getHotReloadStats, } from '../../services/hotreload/store.js';
import { notFound, created, ok } from '../../utils/http-helpers.js';
/**
 * 注册 Hot Reload 路由 (实验性)
 */
export default async function hotReloadRoutes(fastify) {
    // GET /experimental/hotreload/bundles
    fastify.get('/bundles', async () => ok(await listConfigBundles()));
    // POST /experimental/hotreload/bundles
    fastify.post('/bundles', async (request, reply) => {
        const body = request.body;
        const bundle = await createConfigBundle(body);
        return created(reply, bundle);
    });
    // GET /experimental/hotreload/bundles/:id
    fastify.get('/bundles/:id', async (request, reply) => {
        const { id } = request.params;
        const bundle = await getConfigBundle(id);
        if (!bundle)
            return notFound(reply, 'Bundle');
        return ok(bundle);
    });
    // POST /experimental/hotreload/bundles/:id/validate
    fastify.post('/bundles/:id/validate', async (request, reply) => {
        const { id } = request.params;
        const { validator_id } = request.body;
        const bundle = await validateConfigBundle(id, validator_id);
        if (!bundle)
            return notFound(reply, 'Bundle');
        return ok(bundle);
    });
    // POST /experimental/hotreload/bundles/:id/activate
    fastify.post('/bundles/:id/activate', async (request, reply) => {
        const { id } = request.params;
        const bundle = await activateConfigBundle(id);
        if (!bundle)
            return notFound(reply, 'Bundle');
        return ok(bundle);
    });
    // POST /experimental/hotreload/bundles/:id/rollback
    fastify.post('/bundles/:id/rollback', async (request, reply) => {
        const { id } = request.params;
        const bundle = await rollbackConfigBundle(id);
        if (!bundle)
            return notFound(reply, 'Bundle');
        return ok(bundle);
    });
    // GET /experimental/hotreload/stats
    fastify.get('/stats', async () => ok(getHotReloadStats()));
}
//# sourceMappingURL=hotreload.js.map