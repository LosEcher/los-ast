/**
 * 故障归因 API 路由
 * Phase 1.3: 故障归因系统
 */
import { createHypothesis, getHypothesis, updateHypothesisStatus, queryHypotheses, createEvidenceBundle, getEvidenceBundle, getAttributionStats, } from '../services/attribution/store.js';
/**
 * 注册 Attribution 路由
 */
export default async function attributionRoutes(fastify) {
    // POST /attribution/hypotheses - 创建假设
    fastify.post('/hypotheses', async (request, reply) => {
        const body = request.body;
        const hypothesis = await createHypothesis(body);
        reply.status(201);
        return { hypothesis };
    });
    // GET /attribution/hypotheses/:id - 获取假设
    fastify.get('/hypotheses/:id', async (request, reply) => {
        const { id } = request.params;
        const hypothesis = await getHypothesis(id);
        if (!hypothesis) {
            reply.status(404);
            return { error: { message: 'Hypothesis not found' } };
        }
        return { hypothesis };
    });
    // PATCH /attribution/hypotheses/:id/status - 更新假设状态
    fastify.patch('/hypotheses/:id/status', async (request, reply) => {
        const { id } = request.params;
        const body = request.body;
        const hypothesis = await updateHypothesisStatus(id, body.status, body.confidence, body.actor_id, body.reason);
        if (!hypothesis) {
            reply.status(404);
            return { error: { message: 'Hypothesis not found' } };
        }
        return { hypothesis };
    });
    // GET /attribution/hypotheses - 查询假设
    fastify.get('/hypotheses', async (request) => {
        const query = request.query;
        const result = await queryHypotheses({
            incident_id: query.incident_id,
            status: query.status,
            category: query.category,
            limit: query.limit ? parseInt(query.limit, 10) : undefined,
            offset: query.offset ? parseInt(query.offset, 10) : undefined,
        });
        return result;
    });
    // POST /attribution/evidence - 创建证据包
    fastify.post('/evidence', async (request, reply) => {
        const body = request.body;
        // 创建证据项
        const evidenceItems = body.evidence_types.map((type) => ({
            item_id: `evd_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            type,
            source: `${type}_collector`,
            content: { collected: true },
            timestamp: new Date().toISOString(),
            metadata: {
                time_range: body.time_range,
                scope: body.scope,
            },
        }));
        const bundle = await createEvidenceBundle(body.incident_id, evidenceItems);
        reply.status(201);
        return { bundle };
    });
    // GET /attribution/evidence/:id - 获取证据包
    fastify.get('/evidence/:id', async (request, reply) => {
        const { id } = request.params;
        const bundle = await getEvidenceBundle(id);
        if (!bundle) {
            reply.status(404);
            return { error: { message: 'Evidence bundle not found' } };
        }
        return { bundle };
    });
    // POST /attribution/analyze - 执行归因分析 (模拟)
    fastify.post('/analyze', async (request) => {
        const body = request.body;
        // 模拟归因分析结果
        const analysis = {
            analysis_id: `ana_${Date.now()}`,
            incident_id: body.incident_id,
            hypotheses: [
                {
                    title: 'Possible configuration error',
                    description: 'Recent configuration change may have caused the issue',
                    category: 'config_error',
                    confidence: 0.75,
                    root_cause: {
                        component: 'config_service',
                        description: 'Configuration mismatch detected',
                    },
                    evidence_summary: ['Config change at 10:00', 'Error started at 10:05'],
                },
            ],
            recommended_action: 'Check recent configuration changes',
            confidence_summary: {
                highest: 0.75,
                average: 0.75,
                lowest: 0.75,
            },
            provider_used: 'lsclaw',
            cost: 0.001,
            latency_ms: 250,
            created_at: new Date().toISOString(),
        };
        return { analysis };
    });
    // GET /attribution/stats - 获取统计信息
    fastify.get('/stats', async () => {
        const stats = getAttributionStats();
        return { stats };
    });
}
//# sourceMappingURL=attribution.js.map