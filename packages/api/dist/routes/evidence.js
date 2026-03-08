/**
 * los-ast 证据生成 API 路由
 * Phase 1.7: los-ast 证据生成
 */
import { generateEvidence, getEvidenceBundle, validatePatchSafety, generateRewrite, explainCode, getCodeStats, } from '../services/evidence/service.js';
import { notFound, created, ok } from '../utils/http-helpers.js';
export default async function evidenceRoutes(fastify) {
    // POST /evidence/generate - 生成证据包
    fastify.post('/generate', async (request, reply) => {
        const body = request.body;
        const bundle = await generateEvidence(body);
        return created(reply, bundle);
    });
    // GET /evidence/:id - 获取证据包
    fastify.get('/:id', async (request, reply) => {
        const { id } = request.params;
        const bundle = await getEvidenceBundle(id);
        if (!bundle)
            return notFound(reply, 'Evidence bundle');
        return ok(bundle);
    });
    // POST /evidence/validate-patch - 验证 Patch 安全性
    fastify.post('/validate-patch', async (request) => ok(await validatePatchSafety(request.body)));
    // POST /evidence/rewrite - 生成改写候选
    fastify.post('/rewrite', async (request) => ok(await generateRewrite(request.body)));
    // POST /evidence/explain - 解释代码
    fastify.post('/explain', async (request) => ok(await explainCode(request.body)));
    // GET /evidence/stats/:project - 获取代码统计
    fastify.get('/stats/:project', async (request) => ok(await getCodeStats(request.params.project)));
}
//# sourceMappingURL=evidence.js.map