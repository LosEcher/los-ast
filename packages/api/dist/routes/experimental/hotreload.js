/**
 * 热重载 API 路由 (实验性)
 * Phase 1.6: 热重载系统
 *
 * 注意: 纯开发辅助功能，不应用于生产环境
 */
import { createConfigBundle, getConfigBundle, validateConfigBundle, activateConfigBundle, rollbackConfigBundle, listConfigBundles, getHotReloadStats, } from '../../services/hotreload/store.js';
import { notFound, created, ok } from '../../utils/http-helpers.js';
import { ValidationError } from '../../types/errors.js';
const requestScopeSchema = {
    type: 'object',
    properties: {
        tenant_id: { type: 'string' },
        project_id: { type: 'string' },
        actor_id: { type: 'string' },
        trace_id: { type: 'string' },
        mode: { type: 'string', enum: ['local', 'service'] },
    },
};
const bundleIdParamsSchema = {
    type: 'object',
    required: ['id'],
    additionalProperties: false,
    properties: {
        id: { type: 'string', minLength: 1 },
    },
};
const createBundleBodySchema = {
    type: 'object',
    required: ['version', 'target_scope', 'configs'],
    additionalProperties: false,
    properties: {
        scope: requestScopeSchema,
        target_scope: {
            type: 'object',
            additionalProperties: false,
            properties: {
                tenants: { type: 'array', items: { type: 'string' } },
                projects: { type: 'array', items: { type: 'string' } },
                percentage: { type: 'number', minimum: 0, maximum: 100 },
            },
        },
        configs: {
            type: 'object',
            additionalProperties: false,
            properties: {
                detectors: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['detector_id', 'name', 'type', 'enabled', 'parameters'],
                        additionalProperties: false,
                        properties: {
                            detector_id: { type: 'string', minLength: 1 },
                            name: { type: 'string', minLength: 1 },
                            type: { type: 'string', enum: ['metric', 'log', 'composite'] },
                            enabled: { type: 'boolean' },
                            parameters: { type: 'object' },
                        },
                    },
                },
                recovery_policies: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['policy_id', 'level', 'auto_execute', 'cooldown_seconds'],
                        additionalProperties: false,
                        properties: {
                            policy_id: { type: 'string', minLength: 1 },
                            level: { type: 'string', enum: ['L1', 'L2', 'L3'] },
                            auto_execute: { type: 'boolean' },
                            cooldown_seconds: { type: 'integer', minimum: 0 },
                        },
                    },
                },
                recipes: { type: 'array', items: { type: 'string', minLength: 1 } },
                thresholds: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['threshold_id', 'metric_name', 'warning', 'critical'],
                        additionalProperties: false,
                        properties: {
                            threshold_id: { type: 'string', minLength: 1 },
                            metric_name: { type: 'string', minLength: 1 },
                            warning: { type: 'number' },
                            critical: { type: 'number' },
                        },
                    },
                },
            },
        },
        version: { type: 'string', minLength: 1 },
    },
};
const validateBundleBodySchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
        scope: requestScopeSchema,
        validator_id: { type: 'string', minLength: 1 },
    },
};
const activateBundleBodySchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
        scope: requestScopeSchema,
        strategy: { type: 'string', enum: ['immediate', 'canary', 'gradual'] },
        canary_percentage: { type: 'number', minimum: 0, maximum: 100 },
    },
};
const rollbackBundleBodySchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
        scope: requestScopeSchema,
    },
};
/**
 * 注册 Hot Reload 路由 (实验性)
 */
export default async function hotReloadRoutes(fastify) {
    // GET /experimental/hotreload/bundles
    fastify.get('/bundles', async () => ok(await listConfigBundles()));
    // POST /experimental/hotreload/bundles
    fastify.post('/bundles', {
        schema: {
            body: createBundleBodySchema,
        },
    }, async (request, reply) => {
        const body = request.body;
        const bundle = await createConfigBundle(body);
        return created(reply, bundle);
    });
    // GET /experimental/hotreload/bundles/:id
    fastify.get('/bundles/:id', {
        schema: {
            params: bundleIdParamsSchema,
        },
    }, async (request, reply) => {
        const { id } = request.params;
        const bundle = await getConfigBundle(id);
        if (!bundle)
            return notFound(reply, 'Bundle');
        return ok(bundle);
    });
    // POST /experimental/hotreload/bundles/:id/validate
    fastify.post('/bundles/:id/validate', {
        schema: {
            params: bundleIdParamsSchema,
            body: validateBundleBodySchema,
        },
    }, async (request, reply) => {
        const { id } = request.params;
        const { validator_id } = request.body;
        const validatedBy = request.scope?.actor_id || validator_id;
        if (!validatedBy) {
            throw new ValidationError('MISSING_ACTOR_ID', 'Bundle validation requires a verified actor_id');
        }
        const bundle = await validateConfigBundle(id, validatedBy);
        if (!bundle)
            return notFound(reply, 'Bundle');
        return ok(bundle);
    });
    // POST /experimental/hotreload/bundles/:id/activate
    fastify.post('/bundles/:id/activate', {
        schema: {
            params: bundleIdParamsSchema,
            body: activateBundleBodySchema,
        },
    }, async (request, reply) => {
        const { id } = request.params;
        request.body;
        const bundle = await activateConfigBundle(id);
        if (!bundle)
            return notFound(reply, 'Bundle');
        return ok(bundle);
    });
    // POST /experimental/hotreload/bundles/:id/rollback
    fastify.post('/bundles/:id/rollback', {
        schema: {
            params: bundleIdParamsSchema,
            body: rollbackBundleBodySchema,
        },
    }, async (request, reply) => {
        const { id } = request.params;
        const bundle = await rollbackConfigBundle(id);
        if (!bundle)
            return notFound(reply, 'Bundle');
        return ok(bundle);
    });
    // GET /experimental/hotreload/stats
    fastify.get('/stats', async () => ok(getHotReloadStats()));
}
