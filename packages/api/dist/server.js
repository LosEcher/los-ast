import Fastify from 'fastify';
import { logStartupConfig, PORT, ROUTE_CONFIG, validateConfig } from './config/index.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import requestIdPlugin from './plugins/request-id.js';
import scopeValidatorPlugin from './plugins/scope-validator.js';
import identityPlugin from './plugins/identity.js';
import healthCheckPlugin from './plugins/health-check.js';
import cancellationPlugin from './plugins/cancellation.js';
import internalAccessPlugin from './plugins/internal-access.js';
// Core Routes - P0 核心路由 (始终启用)
import { scanRoutes, discoverRoutes } from './routes/core/index.js';
// Experimental Routes - 实验性路由 (条件启用)
import { memoryProposalsRoutes, incidentRoutes, attributionRoutes, recoveryRoutes, approvalRoutes, hotReloadRoutes, evidenceRoutes, } from './routes/experimental/index.js';
import vpsAgentWebRoutes from './routes/vps-agent-web/index.js';
const server = Fastify({
    logger: true,
});
// ============================================
// 1. 注册基础插件（顺序很重要）
// ============================================
// 1. 先注册 request-id，确保所有请求都有 ID
await server.register(requestIdPlugin);
// 2. 注册 error-handler，确保错误处理使用 requestId
await server.register(errorHandlerPlugin);
// 3. 注册 health-check（在 scope-validator 之前，避免 scope 验证）
await server.register(healthCheckPlugin);
// 4. 注册 cancellation，为所有请求添加取消支持（硬约束 #5）
await server.register(cancellationPlugin);
// 5. 注册 scope-validator，验证 scope（在路由之前）
await server.register(scopeValidatorPlugin);
await server.register(identityPlugin);
// ============================================
// 2. 路由分组注册函数
// ============================================
/**
 * 注册 Core 路由 (P0) - 始终启用
 * 硬约束 #1: P0 Scope Freeze
 */
async function registerCoreRoutes(fastify) {
    await fastify.register(scanRoutes, { prefix: '/scan' });
    await fastify.register(discoverRoutes, { prefix: '/discover' });
    console.log('[ROUTES] Core routes registered: /scan, /discover');
}
/**
 * 注册 Experimental 路由 - 条件启用
 * 默认关闭，需设置 ENABLE_EXPERIMENTAL_ROUTES=true
 */
async function registerExperimentalRoutes(fastify) {
    if (!ROUTE_CONFIG.enableExperimental) {
        console.log('[ROUTES] Experimental routes disabled (set ENABLE_EXPERIMENTAL_ROUTES=true to enable)');
        return;
    }
    const exp = ROUTE_CONFIG.prefixes.experimental;
    await fastify.register(memoryProposalsRoutes, { prefix: `${exp}/memory-proposals` });
    await fastify.register(incidentRoutes, { prefix: `${exp}/incidents` });
    await fastify.register(attributionRoutes, { prefix: `${exp}/attribution` });
    await fastify.register(recoveryRoutes, { prefix: `${exp}/recovery` });
    await fastify.register(approvalRoutes, { prefix: `${exp}/approvals` });
    await fastify.register(hotReloadRoutes, { prefix: `${exp}/hotreload` });
    await fastify.register(evidenceRoutes, { prefix: `${exp}/evidence` });
    console.log('[ROUTES] Experimental routes registered with prefix:', exp);
}
/**
 * 注册 Internal 路由 - 条件启用
 * 默认关闭，需设置 ENABLE_INTERNAL_ROUTES=true
 * 同时需要配置访问控制（IP白名单或Token）
 */
async function registerInternalRoutes(fastify) {
    if (!ROUTE_CONFIG.enableInternal) {
        console.log('[ROUTES] Internal routes disabled (set ENABLE_INTERNAL_ROUTES=true to enable)');
        return;
    }
    const internal = ROUTE_CONFIG.prefixes.internal;
    // 注册内部访问控制插件（在 scope-validator 之后）
    await fastify.register(internalAccessPlugin);
    console.log('[ROUTES] Internal routes registered with prefix:', internal);
    console.log('[ROUTES] Internal access control: IP whitelist + Token verification enabled');
    // 预留 Internal 路由注册
    // await fastify.register(internalRoutes, { prefix: internal });
}
async function registerVpsAgentWebRoutes(fastify) {
    if (!ROUTE_CONFIG.enableVpsAgentWeb) {
        console.log('[ROUTES] VPS Agent Web routes disabled (set ENABLE_VPS_AGENT_WEB_ROUTES=true to enable)');
        return;
    }
    const vps = ROUTE_CONFIG.prefixes.vpsAgentWeb;
    await fastify.register(vpsAgentWebRoutes, { prefix: vps });
    console.log('[ROUTES] VPS Agent Web routes registered with prefix:', vps);
}
// ============================================
// 3. 执行路由注册
// ============================================
await registerCoreRoutes(server);
await registerExperimentalRoutes(server);
await registerInternalRoutes(server);
await registerVpsAgentWebRoutes(server);
// ============================================
// 4. 启动服务
// ============================================
async function main() {
    // 验证配置
    const validation = validateConfig();
    if (!validation.valid) {
        console.error('[STARTUP] Configuration validation failed:');
        validation.errors.forEach((err) => {
            console.error(`  - ${err}`);
        });
        process.exit(1);
    }
    logStartupConfig();
    try {
        await server.listen({ port: PORT, host: '0.0.0.0' });
        console.log(`[STARTUP] API server listening on port ${PORT}`);
    }
    catch (err) {
        server.log.error(err);
        process.exit(1);
    }
}
main();
