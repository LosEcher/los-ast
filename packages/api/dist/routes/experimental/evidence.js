/**
 * los-ast 证据生成 API 路由 (实验性)
 * Phase 1.7: los-ast 证据生成
 *
 * 注意: 此路由作为执行结果元数据能力，仅服务于单次执行
 * 不形成独立平台状态机
 */
import { generateEvidence, getEvidenceBundle, validatePatchSafety, generateRewrite, explainCode, getCodeStats, } from '../../services/evidence/service.js';
import { notFound, created, ok } from '../../utils/http-helpers.js';
/**
 * 注册 Evidence 路由 (实验性)
 */
export default async function evidenceRoutes(fastify) {
    fastify.post('/generate', async (request, reply) => {
        const body = request.body;
        const scope = request.scope;
        const bundle = await generateEvidence(body, scope);
        return created(reply, bundle);
    });
    // GET /experimental/evidence/:id - 获取证据包
    fastify.get('/:id', async (request, reply) => {
        const { id } = request.params;
        const bundle = await getEvidenceBundle(id);
        if (!bundle)
            return notFound(reply, 'Evidence bundle');
        return ok(bundle);
    });
    // POST /experimental/evidence/validate-patch - 验证 Patch 安全性
    fastify.post('/validate-patch', async (request) => ok(await validatePatchSafety(request.body)));
    // POST /experimental/evidence/rewrite - 生成改写候选
    fastify.post('/rewrite', async (request) => ok(await generateRewrite(request.body)));
    // POST /experimental/evidence/explain - 解释代码
    fastify.post('/explain', async (request) => ok(await explainCode(request.body)));
    // GET /experimental/evidence/stats/:project - 获取代码统计
    fastify.get('/stats/:project', async (request) => ok(await getCodeStats(request.params.project)));
}
//# sourceMappingURL=evidence.js.map