import { scan, discoverFiles, isReady, loadRuleFiles } from '@los-ast/core';
import { PARSER_CONFIG, SCAN_LIMITS } from '../config/index.js';
import { CoreNotReadyError, ScanTooLargeError, ValidationError } from '../types/errors.js';
import type {
  ScanResult,
  ContractArtifactFindingInput,
  SchemaArtifactFindingInput,
  OpenApiComparisonInput,
  OpenApiDocumentInput,
  SchemaComparisonInput,
  SchemaDocumentInput,
} from '@los-ast/shared/types';
import { parseArtifactInputs } from './artifact-parsers/index.js';
import {
  buildFindingsFromArtifacts,
  buildScanTelemetry,
  countNativeInputs,
  hasNativeArtifactInputs,
  hasScannableRootDir,
  mergeScanResultFindings,
  requiresCodeScan,
} from './scan-service/shared.js';

export interface ScanServiceOptions {
  project: string;
  rootDir?: string;
  include?: string[];
  ignore?: string[];
  rules?: string[];  // 规则文件 glob 模式数组
  includeStats?: boolean;
  deterministic?: boolean;
  openApiDocuments?: OpenApiDocumentInput[];
  openApiComparisons?: OpenApiComparisonInput[];
  schemaDocuments?: SchemaDocumentInput[];
  schemaComparisons?: SchemaComparisonInput[];
  contractArtifacts?: ContractArtifactFindingInput[];
  schemaArtifacts?: SchemaArtifactFindingInput[];
  signal: AbortSignal;
}

export class ScanService {
  /**
   * 预估文件数量
   * 使用 discoverFiles 快速统计匹配文件数
   */
  async estimateFileCount(rootDir: string, include?: string[], ignore?: string[]): Promise<number> {
    try {
      const files = await discoverFiles({ rootDir, include, ignore });
      return files.length;
    } catch (error) {
      throw new ValidationError(
        'FILE_COUNT_ESTIMATE_FAILED',
        error instanceof Error
          ? `failed to estimate candidate files before scan: ${error.message}`
          : 'failed to estimate candidate files before scan'
      );
    }
  }

  /**
   * 执行扫描
   * 1. 检查 Core 是否就绪
   * 2. 预估文件数量
   * 3. 检查文件数限制
   * 4. 执行扫描（带超时和取消支持）
   */
  async execute(options: ScanServiceOptions): Promise<ScanResult> {
    const startedAt = Date.now();
    const {
      project,
      rootDir,
      include,
      ignore,
      rules: rulePatterns,
      includeStats,
      deterministic,
      openApiDocuments,
      openApiComparisons,
      schemaDocuments,
      schemaComparisons,
      contractArtifacts,
      schemaArtifacts,
      signal,
    } = options;
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

    let result: ScanResult = {
      filesScanned: 0,
      findings: [],
    };
    let loadedRules = 0;
    let estimatedFiles: number | undefined;

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
      }) as unknown as ScanResult;
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
        result.scanTelemetry = buildScanTelemetry({
          startedAt,
          shouldRunAstScan,
          hasNativeArtifacts,
          explicitRulePatterns,
          loadedRules,
          estimatedFiles,
          nativeInputCounts,
        });
      }
      return result as unknown as ScanResult;
    }

    const mergedResult = mergeScanResultFindings({
      result,
      contractFindings,
      schemaFindings,
      deterministic,
    }) as unknown as ScanResult;

    if (includeStats) {
      mergedResult.scanTelemetry = buildScanTelemetry({
        startedAt,
        shouldRunAstScan,
        hasNativeArtifacts,
        explicitRulePatterns,
        loadedRules,
        estimatedFiles,
        nativeInputCounts,
      });
    }

    return mergedResult;
  }
}

// 导出单例实例
export const scanService = new ScanService();
