import { existsSync } from 'node:fs';
import path from 'node:path';
import { getBuiltInRulePackNames, getBuiltInRulePackPattern } from '@los-ast/rules';
import { scanService } from '../../services/scan-service.js';
import { SCAN_LIMITS } from '../../config/index.js';
import { ValidationError, ScanTooLargeError } from '../../types/errors.js';
import { buildScanRequestBodySchema, scanResponseSchema } from './scan-schema.js';
const BUILT_IN_RULE_PACK_NAMES = getBuiltInRulePackNames();
function hasRuleCatalog(baseDir) {
    const languageDir = path.join(baseDir, 'languages');
    const projectDir = path.join(baseDir, 'projects');
    return existsSync(languageDir) && existsSync(projectDir);
}
function isPreferredRuleRoot(baseDir) {
    return path.basename(path.resolve(baseDir, '..')) !== 'packages';
}
let resolvedRulesRoot = null;
function resolveRulesRoot() {
    if (resolvedRulesRoot) {
        return resolvedRulesRoot;
    }
    const candidates = [
        path.resolve(process.cwd(), 'rules'),
        path.resolve(process.cwd(), '..', 'rules'),
        path.resolve(process.cwd(), '..', '..', 'rules'),
        path.resolve(process.cwd(), '..', '..', '..', 'rules'),
    ];
    const found = candidates.find((candidate) => existsSync(candidate) && hasRuleCatalog(candidate) && isPreferredRuleRoot(candidate)) ?? candidates.find((candidate) => existsSync(candidate) && hasRuleCatalog(candidate));
    resolvedRulesRoot = found ?? candidates[candidates.length - 1];
    return resolvedRulesRoot;
}
function resolveRulePackPatterns(rulePack) {
    if (!rulePack) {
        return undefined;
    }
    const relativePattern = getBuiltInRulePackPattern(rulePack);
    if (!relativePattern) {
        return undefined;
    }
    return [path.join(resolveRulesRoot(), relativePattern)];
}
function hasNativeArtifactInputs(body) {
    return [
        body.openApiDocuments,
        body.openApiComparisons,
        body.schemaDocuments,
        body.schemaComparisons,
        body.contractArtifacts,
        body.schemaArtifacts,
    ].some((items) => Array.isArray(items) && items.length > 0);
}
function requiresCodeScan(body, resolvedRules) {
    return typeof body.rootDir !== 'undefined'
        || (Array.isArray(body.include) && body.include.length > 0)
        || (Array.isArray(body.ignore) && body.ignore.length > 0)
        || (Array.isArray(body.rules) && body.rules.length > 0)
        || (Array.isArray(resolvedRules) && resolvedRules.length > 0);
}
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
        const body = request.body;
        const shouldRunCodeScan = requiresCodeScan(body, resolvedRules);
        const hasNativeInputs = hasNativeArtifactInputs(body);
        // 验证必填字段
        if (!project || typeof project !== 'string') {
            throw new ValidationError('INVALID_PROJECT', 'project must be a non-empty string');
        }
        if (!shouldRunCodeScan && !hasNativeInputs) {
            throw new ValidationError('INVALID_SCAN_INPUT', 'either rootDir or native artifact inputs must be provided');
        }
        if (shouldRunCodeScan && (!rootDir || typeof rootDir !== 'string')) {
            throw new ValidationError('INVALID_ROOTDIR', 'rootDir must be a non-empty string');
        }
        // 执行扫描
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
        // 检查响应大小限制（硬约束 #4）
        const responseBytes = JSON.stringify(result).length;
        if (responseBytes > SCAN_LIMITS.maxResponseBytes) {
            throw new ScanTooLargeError(SCAN_LIMITS.maxResponseBytes, responseBytes);
        }
        // 返回成功响应
        return reply.send({ data: result });
    }));
}
//# sourceMappingURL=scan.js.map