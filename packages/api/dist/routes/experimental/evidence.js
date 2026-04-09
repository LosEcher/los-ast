/**
 * los-ast 证据生成 API 路由 (实验性)
 * Phase 1.7: los-ast 证据生成
 *
 * 注意: 此路由作为执行结果元数据能力，仅服务于单次执行
 * 不形成独立平台状态机
 */
import { generateEvidence, getEvidenceBundle, validatePatchSafety, generateRewrite, explainCode, getCodeStats, verifyEvidenceSignature, } from '../../services/evidence/service.js';
import { notFound, created, ok } from '../../utils/http-helpers.js';
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
const evidenceIdParamsSchema = {
    type: 'object',
    required: ['id'],
    additionalProperties: false,
    properties: {
        id: { type: 'string', minLength: 1 },
    },
};
const statsProjectParamsSchema = {
    type: 'object',
    required: ['project'],
    additionalProperties: false,
    properties: {
        project: { type: 'string', minLength: 1 },
    },
};
const generateEvidenceBodySchema = {
    type: 'object',
    required: ['project', 'root_dir', 'findings'],
    additionalProperties: false,
    properties: {
        scope: requestScopeSchema,
        project: { type: 'string', minLength: 1 },
        root_dir: { type: 'string', minLength: 1 },
        findings: { type: 'array', items: { type: 'string', minLength: 1 } },
        include: { type: 'array', items: { type: 'string', minLength: 1 } },
        ignore: { type: 'array', items: { type: 'string', minLength: 1 } },
        rules: { type: 'array', items: { type: 'string', minLength: 1 } },
        deterministic: { type: 'boolean' },
        include_context: { type: 'boolean' },
        include_ast: { type: 'boolean' },
        include_symbols: { type: 'boolean' },
    },
};
const validatePatchBodySchema = {
    type: 'object',
    required: ['project', 'original_file', 'proposed_patch'],
    additionalProperties: false,
    properties: {
        scope: requestScopeSchema,
        project: { type: 'string', minLength: 1 },
        original_file: { type: 'string', minLength: 1 },
        proposed_patch: { type: 'string', minLength: 1 },
    },
};
const rewriteBodySchema = {
    type: 'object',
    required: ['project', 'findings', 'options'],
    additionalProperties: false,
    properties: {
        scope: requestScopeSchema,
        project: { type: 'string', minLength: 1 },
        findings: {
            type: 'array',
            items: {
                type: 'object',
                required: ['finding_id', 'approved'],
                additionalProperties: false,
                properties: {
                    finding_id: { type: 'string', minLength: 1 },
                    approved: { type: 'boolean' },
                    suggested_fix: { type: 'string', minLength: 1 },
                },
            },
        },
        options: {
            type: 'object',
            required: ['dry_run', 'max_candidates', 'safety_level'],
            additionalProperties: false,
            properties: {
                dry_run: { type: 'boolean' },
                max_candidates: { type: 'integer', minimum: 1 },
                safety_level: { type: 'string', enum: ['strict', 'moderate', 'lenient'] },
            },
        },
    },
};
const explainBodySchema = {
    type: 'object',
    required: ['file_path', 'line', 'column'],
    additionalProperties: false,
    properties: {
        scope: requestScopeSchema,
        file_path: { type: 'string', minLength: 1 },
        line: { type: 'integer', minimum: 1 },
        column: { type: 'integer', minimum: 1 },
        context_lines: { type: 'integer', minimum: 0 },
    },
};
/**
 * 注册 Evidence 路由 (实验性)
 */
export default async function evidenceRoutes(fastify) {
    fastify.post('/generate', {
        schema: {
            body: generateEvidenceBodySchema,
        },
    }, async (request, reply) => {
        const body = request.body;
        const scope = request.scope;
        const bundle = await generateEvidence(body, scope);
        return created(reply, bundle);
    });
    // GET /experimental/evidence/:id - 获取证据包
    fastify.get('/:id', {
        schema: {
            params: evidenceIdParamsSchema,
        },
    }, async (request, reply) => {
        const { id } = request.params;
        const scope = request.scope;
        const bundle = await getEvidenceBundle(id, scope);
        if (!bundle)
            return notFound(reply, 'Evidence bundle');
        return ok(bundle);
    });
    // POST /experimental/evidence/validate-patch - 验证 Patch 安全性
    fastify.post('/validate-patch', {
        schema: {
            body: validatePatchBodySchema,
        },
    }, async (request) => ok(await validatePatchSafety(request.body)));
    // POST /experimental/evidence/rewrite - 生成改写候选
    fastify.post('/rewrite', {
        schema: {
            body: rewriteBodySchema,
        },
    }, async (request) => ok(await generateRewrite(request.body)));
    // POST /experimental/evidence/explain - 解释代码
    fastify.post('/explain', {
        schema: {
            body: explainBodySchema,
        },
    }, async (request) => ok(await explainCode(request.body)));
    // GET /experimental/evidence/stats/:project - 获取代码统计
    fastify.get('/stats/:project', {
        schema: {
            params: statsProjectParamsSchema,
        },
    }, async (request) => ok(await getCodeStats(request.params.project)));
    // POST /experimental/evidence/:id/verify - 验证证据包签名
    fastify.post('/:id/verify', {
        schema: {
            params: evidenceIdParamsSchema,
        },
    }, async (request, reply) => {
        const { id } = request.params;
        const scope = request.scope;
        const bundle = await getEvidenceBundle(id, scope);
        if (!bundle)
            return notFound(reply, 'Evidence bundle');
        const verification = await verifyEvidenceSignature(bundle);
        return ok({
            bundle_id: id,
            valid: verification.valid,
            reason: verification.reason,
            signature: bundle.signature ? {
                algorithm: bundle.signature.algorithm,
                signed_at: bundle.signature.signed_at,
                signed_by: bundle.signature.signed_by,
                key_id: bundle.signature.key_id,
            } : null,
        });
    });
}
