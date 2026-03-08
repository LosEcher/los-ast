/**
 * Incident API 路由
 * Phase 1.1: Incident 数据模型与采集系统
 */
import { createIncident, getIncident, updateIncidentStatus, queryIncidents, getStoreStats, } from '../services/incident/store.js';
import { collectMetrics, collectLogs, evaluateTriggers, getCollectionStats, } from '../services/incident/collection.js';
/**
 * 注册 Incident 路由
 */
export default async function incidentRoutes(fastify) {
    // GET /incidents - 查询 Incidents
    fastify.get('/', async (request) => {
        const query = request.query;
        const params = {
            tenant_id: query.tenant_id,
            project_id: query.project_id,
            status: query.status,
            severity: query.severity,
            source_type: query.source_type,
            from: query.from,
            to: query.to,
            limit: query.limit ? parseInt(query.limit, 10) : undefined,
            offset: query.offset ? parseInt(query.offset, 10) : undefined,
        };
        const result = await queryIncidents(params);
        return result;
    });
    // POST /incidents - 创建 Incident
    fastify.post('/', async (request, reply) => {
        const body = request.body;
        const incident = await createIncident(body);
        reply.status(201);
        return { incident };
    });
    // GET /incidents/:id - 获取单个 Incident
    fastify.get('/:id', async (request, reply) => {
        const { id } = request.params;
        const incident = await getIncident(id);
        if (!incident) {
            reply.status(404);
            return { error: { message: 'Incident not found' } };
        }
        return { incident };
    });
    // PATCH /incidents/:id/status - 更新 Incident 状态
    fastify.patch('/:id/status', async (request, reply) => {
        const { id } = request.params;
        const body = request.body;
        const incident = await updateIncidentStatus(id, body.status, body.comment, body.actor_id);
        if (!incident) {
            reply.status(404);
            return { error: { message: 'Incident not found' } };
        }
        return { incident };
    });
    // POST /incidents/collect/metrics - 采集指标
    fastify.post('/collect/metrics', async (request) => {
        const body = request.body;
        await collectMetrics(body.scope, body.metrics);
        // 评估触发器
        const triggered = await evaluateTriggers(body.scope, body.metrics);
        return {
            collected: body.metrics.length,
            triggers_evaluated: triggered.length,
            triggered,
        };
    });
    // POST /incidents/collect/logs - 采集日志
    fastify.post('/collect/logs', async (request) => {
        const body = request.body;
        await collectLogs(body.scope, body.logs);
        return {
            collected: body.logs.length,
        };
    });
    // GET /incidents/stats/store - 获取存储统计
    fastify.get('/stats/store', async () => {
        return getStoreStats();
    });
    // GET /incidents/stats/collection - 获取采集统计
    fastify.get('/stats/collection', async () => {
        return getCollectionStats();
    });
}
//# sourceMappingURL=incident.js.map