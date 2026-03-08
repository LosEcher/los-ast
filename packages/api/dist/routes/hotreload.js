/**
 * 热重载 API 路由
 * Phase 1.6: 热重载系统
 */
import { createConfigBundle, getConfigBundle, validateConfigBundle, activateConfigBundle, rollbackConfigBundle, listConfigBundles, getHotReloadStats, } from '../services/hotreload/store.js';
import { notFound, created, ok } from '../utils/http-helpers.js';
export default async function hotReloadRoutes(fastify) {
    // GET /hotreload/bundles
    fastify.get('/bundles', async () => ok(await listConfigBundles()));
    // POST /hotreload/bundles
    fastify.post('/bundles', async (request, reply) => {
        const body = request.body;
        const bundle = await createConfigBundle(body);
        return created(reply, bundle);
    });
    // GET /hotreload/bundles/:id
    fastify.get('/bundles/:id', async (request, reply) => {
        const { id } = request.params;
        const bundle = await getConfigBundle(id);
        if (!bundle)
            return notFound(reply, 'Bundle');
        return ok(bundle);
    });
    // POST /hotreload/bundles/:id/validate
    fastify.post('/bundles/:id/validate', async (request, reply) => {
        const { id } = request.params;
        const { validator_id } = request.body;
        const bundle = await validateConfigBundle(id, validator_id);
        if (!bundle)
            return notFound(reply, 'Bundle');
        return ok(bundle);
    });
    // POST /hotreload/bundles/:id/activate
    fastify.post('/bundles/:id/activate', async (request, reply) => {
        const { id } = request.params;
        const bundle = await activateConfigBundle(id);
        if (!bundle)
            return notFound(reply, 'Bundle');
        return ok(bundle);
    });
    // POST /hotreload/bundles/:id/rollback
    fastify.post('/bundles/:id/rollback', async (request, reply) => {
        const { id } = request.params;
        const bundle = await rollbackConfigBundle(id);
        if (!bundle)
            return notFound(reply, 'Bundle');
        return ok(bundle);
    });
    // GET /hotreload/stats
    fastify.get('/stats', async () => ok(getHotReloadStats()));
}
//# sourceMappingURL=hotreload.js.map