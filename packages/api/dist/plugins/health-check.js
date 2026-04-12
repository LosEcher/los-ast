import fp from 'fastify-plugin';
import { isReady } from '@los-ast/core';
import { ROUTE_CONFIG } from '../config/index.js';
/**
 * 健康检查插件
 * 提供 /healthz/live、/healthz/ready 和 /healthz/capabilities 端点
 */
export default fp(async function healthCheckPlugin(fastify) {
    // Liveness probe - 服务是否存活
    fastify.get('/healthz/live', async () => {
        return { status: 'alive', timestamp: new Date().toISOString() };
    });
    // Readiness probe - 服务是否准备好接收流量
    fastify.get('/healthz/ready', async (_, reply) => {
        const ready = isReady();
        const timestamp = new Date().toISOString();
        if (ready) {
            return { status: 'ready', timestamp };
        }
        else {
            reply.status(503);
            return { status: 'unavailable', timestamp };
        }
    });
    // Capabilities endpoint - 返回当前启用的能力列表和迁移计划
    fastify.get('/healthz/capabilities', async () => {
        const experimentalEnabled = ROUTE_CONFIG.enableExperimental ?? false;
        const vpsEnabled = ROUTE_CONFIG.enableVpsAgentWeb ?? false;
        const capabilities = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            stable: {
                routes: [
                    { path: '/healthz/live', method: 'GET', description: 'Liveness probe' },
                    { path: '/healthz/ready', method: 'GET', description: 'Readiness probe' },
                    { path: '/scan', method: 'POST', description: 'Main scan endpoint' },
                    { path: '/discover/symbols', method: 'POST', description: 'Symbol discovery' },
                ],
                cli: ['scan', 'fix', 'explain', 'doctor'],
                artifacts: ['scan-findings.jsonl', 'symbols.json', 'structure-map.json'],
            },
            preview: {
                enabled: experimentalEnabled,
                routes: experimentalEnabled
                    ? [
                        { path: '/experimental/evidence', description: 'Evidence generation (stable-bound)' },
                        { path: '/experimental/hotreload', description: 'Hot reload (dev helper)' },
                        { path: '/experimental/memory-proposals', description: 'Memory proposals (migrating)', migration: 'los-memory@Milestone B' },
                        { path: '/experimental/incidents', description: 'Incident management (migrating)', migration: 'VPS Agent Web@Milestone B+' },
                        { path: '/experimental/attribution', description: 'Attribution (migrating)', migration: 'VPS Agent Web@Milestone B+' },
                        { path: '/experimental/recovery', description: 'Recovery (migrating)', migration: 'VPS Agent Web@Milestone B+' },
                        { path: '/experimental/approvals', description: 'Approvals (migrating)', migration: 'VPS Agent Web@Milestone B+' },
                    ]
                    : [],
            },
            migration_plan: {
                'memory-proposals': { target: 'los-memory', timeline: 'Milestone B', status: 'planned' },
                incident: { target: 'VPS Agent Web', timeline: 'Milestone B+', status: 'planned' },
                attribution: { target: 'VPS Agent Web', timeline: 'Milestone B+', status: 'planned' },
                recovery: { target: 'VPS Agent Web', timeline: 'Milestone B+', status: 'planned' },
                approval: { target: 'VPS Agent Web', timeline: 'Milestone B+', status: 'planned' },
            },
            flags: {
                enableExperimental: experimentalEnabled,
                enableVpsAgentWeb: vpsEnabled,
            },
        };
        return capabilities;
    });
}, {
    name: 'health-check',
    fastify: '5.x',
});
