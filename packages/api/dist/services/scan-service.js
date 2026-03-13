import crypto from 'node:crypto';
import { scan, discoverFiles, isReady, loadRuleFiles } from '@los-ast/core';
import { PARSER_CONFIG, SCAN_LIMITS } from '../config/index.js';
import { CoreNotReadyError, ScanTooLargeError, ValidationError } from '../types/errors.js';
import { parseArtifactInputs } from './artifact-parsers/index.js';
function toIsoNowForContract(deterministic = false) {
    if (deterministic) {
        return '1970-01-01T00:00:00.000Z';
    }
    return new Date().toISOString();
}
function toContractFindingFingerprint(input, deterministic) {
    const base = [
        input.project,
        input.ruleId,
        input.file,
        `${input.range.start.line}-${input.range.start.column}-${input.range.start.index}`,
        `${input.range.end.line}-${input.range.end.column}-${input.range.end.index}`,
        input.message,
    ].join('\n');
    const hash = crypto.createHash('sha256').update(base).digest('hex');
    return deterministic ? hash.slice(0, 32) : hash;
}
function normalizeRange(input) {
    if (input.range?.start && input.range.end) {
        return {
            start: {
                line: input.range.start.line,
                column: input.range.start.column,
                index: input.range.start.index,
            },
            end: {
                line: input.range.end.line,
                column: input.range.end.column,
                index: input.range.end.index,
            },
        };
    }
    const line = typeof input.line === 'number' && Number.isFinite(input.line) ? Math.max(1, Math.floor(input.line)) : 1;
    const column = typeof input.column === 'number' && Number.isFinite(input.column) ? Math.max(0, Math.floor(input.column)) : 0;
    const startIndex = typeof input.startIndex === 'number' && Number.isFinite(input.startIndex) ? Math.max(0, Math.floor(input.startIndex)) : 0;
    const endIndexRaw = typeof input.endIndex === 'number' && Number.isFinite(input.endIndex) ? Math.max(startIndex, Math.floor(input.endIndex)) : startIndex + 1;
    return {
        start: {
            line,
            column,
            index: startIndex,
        },
        end: {
            line,
            column: Math.max(column + 1, column),
            index: endIndexRaw,
        },
    };
}
function normalizeGovernanceDomain(value) {
    if (!value) {
        return undefined;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? [trimmed] : undefined;
    }
    if (Array.isArray(value)) {
        const domains = value
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter((item) => item.length > 0);
        return domains.length > 0 ? domains : undefined;
    }
    return undefined;
}
function deterministicSortFindings(a, b) {
    if (a.file !== b.file)
        return a.file.localeCompare(b.file);
    if (a.range.start.line !== b.range.start.line)
        return a.range.start.line - b.range.start.line;
    if (a.range.start.column !== b.range.start.column)
        return a.range.start.column - b.range.start.column;
    if (a.range.start.index !== b.range.start.index)
        return a.range.start.index - b.range.start.index;
    const sourceOrder = { ast: 0, contract: 1, schema: 2 };
    const aSource = sourceOrder[a.findingSource || 'ast'];
    const bSource = sourceOrder[b.findingSource || 'ast'];
    if (aSource !== bSource)
        return aSource - bSource;
    if (a.ruleId !== b.ruleId)
        return a.ruleId.localeCompare(b.ruleId);
    if (a.fingerprint !== b.fingerprint)
        return a.fingerprint.localeCompare(b.fingerprint);
    return 0;
}
function hasScannableRootDir(rootDir) {
    return typeof rootDir === 'string' && rootDir.trim().length > 0;
}
function hasNativeArtifactInputs(options) {
    return [
        options.openApiDocuments,
        options.openApiComparisons,
        options.schemaDocuments,
        options.schemaComparisons,
        options.contractArtifacts,
        options.schemaArtifacts,
    ].some((items) => Array.isArray(items) && items.length > 0);
}
function countNativeInputs(options) {
    return {
        openApiDocuments: Array.isArray(options.openApiDocuments) ? options.openApiDocuments.length : 0,
        openApiComparisons: Array.isArray(options.openApiComparisons) ? options.openApiComparisons.length : 0,
        schemaDocuments: Array.isArray(options.schemaDocuments) ? options.schemaDocuments.length : 0,
        schemaComparisons: Array.isArray(options.schemaComparisons) ? options.schemaComparisons.length : 0,
        contractArtifacts: Array.isArray(options.contractArtifacts) ? options.contractArtifacts.length : 0,
        schemaArtifacts: Array.isArray(options.schemaArtifacts) ? options.schemaArtifacts.length : 0,
    };
}
function requiresCodeScan(options) {
    return typeof options.rootDir !== 'undefined'
        || (Array.isArray(options.include) && options.include.length > 0)
        || (Array.isArray(options.ignore) && options.ignore.length > 0)
        || (Array.isArray(options.rules) && options.rules.length > 0);
}
function buildFindingsFromArtifacts({ project, contractArtifacts, schemaArtifacts, deterministic = false, defaultFindingSource, }) {
    const artifacts = defaultFindingSource === 'schema'
        ? schemaArtifacts
        : contractArtifacts;
    if (!Array.isArray(artifacts) || artifacts.length === 0) {
        return [];
    }
    return artifacts.map((artifact, index) => {
        const ruleId = typeof artifact.ruleId === 'string' && artifact.ruleId.length > 0
            ? artifact.ruleId
            : `${defaultFindingSource}-${index}`;
        const message = artifact.message || 'Contract finding';
        const severity = artifact.severity || 'warning';
        const range = normalizeRange(artifact);
        const file = artifact.file || defaultFindingSource;
        const findingSource = defaultFindingSource;
        const impactHint = artifact.impactHint || 'medium';
        const finding = {
            tool: 'los-ast',
            version: 0,
            timestamp: toIsoNowForContract(deterministic),
            project,
            ruleFile: artifact.source || defaultFindingSource,
            ruleId,
            findingSource,
            governanceDomain: normalizeGovernanceDomain(artifact.governanceDomain),
            impactHint,
            severity,
            message,
            file,
            language: artifact.language || defaultFindingSource,
            range,
            excerpt: artifact.excerpt || message,
            hasFix: false,
            proposedReplacement: null,
            fingerprint: toContractFindingFingerprint({
                project,
                file,
                ruleId,
                range,
                message,
                deterministic,
            }, deterministic),
        };
        return finding;
    });
}
export class ScanService {
    /**
     * 预估文件数量
     * 使用 discoverFiles 快速统计匹配文件数
     */
    async estimateFileCount(rootDir, include, ignore) {
        try {
            const files = await discoverFiles({ rootDir, include, ignore });
            return files.length;
        }
        catch (error) {
            throw new ValidationError('FILE_COUNT_ESTIMATE_FAILED', error instanceof Error
                ? `failed to estimate candidate files before scan: ${error.message}`
                : 'failed to estimate candidate files before scan');
        }
    }
    /**
     * 执行扫描
     * 1. 检查 Core 是否就绪
     * 2. 预估文件数量
     * 3. 检查文件数限制
     * 4. 执行扫描（带超时和取消支持）
     */
    async execute(options) {
        const startedAt = Date.now();
        const { project, rootDir, include, ignore, rules: rulePatterns, includeStats, deterministic, openApiDocuments, openApiComparisons, schemaDocuments, schemaComparisons, contractArtifacts, schemaArtifacts, signal, } = options;
        const nativeInputCounts = countNativeInputs(options);
        const explicitRulePatterns = Array.isArray(rulePatterns) ? rulePatterns.length : 0;
        const parsedArtifacts = parseArtifactInputs({
            openApiDocuments,
            openApiComparisons,
            schemaDocuments,
            schemaComparisons,
            contractArtifacts,
            schemaArtifacts,
            runtimeConfig: PARSER_CONFIG,
        });
        const hasNativeArtifacts = hasNativeArtifactInputs({
            openApiDocuments,
            openApiComparisons,
            schemaDocuments,
            schemaComparisons,
            contractArtifacts,
            schemaArtifacts,
        });
        const shouldRunAstScan = requiresCodeScan({
            rootDir,
            include,
            ignore,
            rules: rulePatterns,
            includeStats,
        });
        if (!shouldRunAstScan && !hasNativeArtifacts) {
            throw new ValidationError('INVALID_SCAN_INPUT', 'either rootDir or native artifact inputs must be provided');
        }
        if (signal.aborted) {
            throw new Error('Scan aborted');
        }
        let result = {
            filesScanned: 0,
            findings: [],
        };
        let loadedRules = 0;
        let estimatedFiles;
        if (shouldRunAstScan) {
            if (!hasScannableRootDir(rootDir)) {
                throw new ValidationError('INVALID_ROOTDIR', 'rootDir must be a non-empty string');
            }
            // 检查 Core 是否已初始化
            if (!isReady()) {
                throw new CoreNotReadyError();
            }
            // 加载规则
            const rules = rulePatterns && rulePatterns.length > 0
                ? await loadRuleFiles(rulePatterns)
                : [];
            loadedRules = rules.length;
            // 预估文件数量
            const estimatedCount = await this.estimateFileCount(rootDir, include, ignore);
            estimatedFiles = estimatedCount;
            // 检查文件数限制（硬约束 #4）
            if (estimatedCount > SCAN_LIMITS.maxFilesPerSyncScan) {
                throw new ScanTooLargeError(SCAN_LIMITS.maxFilesPerSyncScan, estimatedCount);
            }
            // 执行扫描
            result = await scan({
                project,
                rootDir,
                include,
                ignore,
                rules,
                includeStats,
                deterministic,
                signal,
            });
        }
        const contractFindings = buildFindingsFromArtifacts({
            project,
            contractArtifacts: parsedArtifacts.contractArtifacts,
            schemaArtifacts: parsedArtifacts.schemaArtifacts,
            deterministic: deterministic ?? false,
            defaultFindingSource: 'contract',
        });
        const schemaFindings = buildFindingsFromArtifacts({
            project,
            contractArtifacts: parsedArtifacts.contractArtifacts,
            schemaArtifacts: parsedArtifacts.schemaArtifacts,
            deterministic: deterministic ?? false,
            defaultFindingSource: 'schema',
        });
        if (contractFindings.length === 0 && schemaFindings.length === 0) {
            if (includeStats) {
                result.scanTelemetry = {
                    durationMs: Date.now() - startedAt,
                    mode: shouldRunAstScan && hasNativeArtifacts ? 'hybrid' : shouldRunAstScan ? 'ast' : 'native_only',
                    explicitRulePatterns,
                    loadedRules,
                    ...(typeof estimatedFiles === 'number' ? { estimatedFiles } : {}),
                    nativeInputs: nativeInputCounts,
                };
            }
            return result;
        }
        const mergedFindings = [
            ...result.findings,
            ...contractFindings,
            ...schemaFindings,
        ];
        if (deterministic) {
            mergedFindings.sort(deterministicSortFindings);
        }
        const mergedResult = {
            ...result,
            findings: mergedFindings,
        };
        if (includeStats) {
            mergedResult.scanTelemetry = {
                durationMs: Date.now() - startedAt,
                mode: shouldRunAstScan && hasNativeArtifacts ? 'hybrid' : shouldRunAstScan ? 'ast' : 'native_only',
                explicitRulePatterns,
                loadedRules,
                ...(typeof estimatedFiles === 'number' ? { estimatedFiles } : {}),
                nativeInputs: nativeInputCounts,
            };
        }
        return mergedResult;
    }
}
// 导出单例实例
export const scanService = new ScanService();
