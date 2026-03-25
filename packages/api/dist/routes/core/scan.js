import { scanService } from '../../services/scan-service.js';
import { SCAN_LIMITS } from '../../config/index.js';
import { ScanTooLargeError } from '../../types/errors.js';
import { buildScanRequestBodySchema, scanResponseSchema } from './scan-schema.js';
import { BUILT_IN_RULE_PACK_NAMES, resolveRulePackPatterns, validateScanRequestBody, } from './scan/shared.js';
export default async function scanRoutes(fastify) {
    // POST /scan - 执行同步扫描
    fastify.post('/', {
        schema: {
            description: '执行代码扫描',
            body: buildScanRequestBodySchema(BUILT_IN_RULE_PACK_NAMES),
            response: {
                200: scanResponseSchema,
            },
        },
    }, fastify.withCancellation(async (request, reply, signal) => {
        const { project, rootDir, include, ignore, rules, includeStats, deterministic, rulePack, openApiDocuments, openApiComparisons, schemaDocuments, schemaComparisons, } = request.body;
        const { contractArtifacts, schemaArtifacts } = request.body;
        const resolvedRules = rules && rules.length > 0
            ? rules
            : resolveRulePackPatterns(rulePack);
        validateScanRequestBody(request.body, resolvedRules);
        const result = await scanService.execute({
            project,
            rootDir,
            include,
            ignore,
            rules: resolvedRules,
            includeStats: includeStats ?? false,
            deterministic,
            openApiDocuments,
            openApiComparisons,
            schemaDocuments,
            schemaComparisons,
            contractArtifacts,
            schemaArtifacts,
            signal,
        });
        const responseBytes = JSON.stringify(result).length;
        if (responseBytes > SCAN_LIMITS.maxResponseBytes) {
            throw new ScanTooLargeError(SCAN_LIMITS.maxResponseBytes, responseBytes);
        }
        return reply.send({ data: result });
    }));
}
