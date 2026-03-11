import crypto from 'node:crypto';

import { scan, discoverFiles, isReady, loadRuleFiles } from '@los-ast/core';
import { PARSER_CONFIG, SCAN_LIMITS } from '../config/index.js';
import { CoreNotReadyError, ScanTooLargeError } from '../types/errors.js';
import type {
  Finding,
  ScanResult,
  FindingSource,
  ContractArtifactFindingInput,
  SchemaArtifactFindingInput,
  OpenApiComparisonInput,
  OpenApiDocumentInput,
  SchemaComparisonInput,
  SchemaDocumentInput,
} from '@los-ast/shared/types';
import { parseArtifactInputs } from './artifact-parsers/index.js';

interface ContractFindingRange {
  start: { line: number; column: number; index: number };
  end: { line: number; column: number; index: number };
}

interface ScanArtifactOptions {
  project: string;
  contractArtifacts?: ContractArtifactFindingInput[];
  schemaArtifacts?: SchemaArtifactFindingInput[];
  deterministic?: boolean;
  defaultFindingSource: FindingSource;
}

export interface ScanServiceOptions {
  project: string;
  rootDir: string;
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

function toIsoNowForContract(deterministic = false) {
  if (deterministic) {
    return '1970-01-01T00:00:00.000Z';
  }
  return new Date().toISOString();
}

function toContractFindingFingerprint(
  input: {
    project: string;
    file: string;
    ruleId: string;
    range: ContractFindingRange;
    message: string;
    deterministic: boolean;
  },
  deterministic?: boolean
) {
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

function normalizeRange(input: ContractArtifactFindingInput): ContractFindingRange {
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

function normalizeGovernanceDomain(value: unknown): string[] | undefined {
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

function deterministicSortFindings(a: Finding, b: Finding) {
  if (a.file !== b.file) return a.file.localeCompare(b.file);
  if (a.range.start.line !== b.range.start.line) return a.range.start.line - b.range.start.line;
  if (a.range.start.column !== b.range.start.column) return a.range.start.column - b.range.start.column;
  if (a.range.start.index !== b.range.start.index) return a.range.start.index - b.range.start.index;
  return 0;
}

function buildFindingsFromArtifacts({
  project,
  contractArtifacts,
  schemaArtifacts,
  deterministic = false,
  defaultFindingSource,
}: ScanArtifactOptions & { defaultFindingSource: FindingSource }): Finding[] {
  const artifacts = defaultFindingSource === 'schema'
    ? schemaArtifacts
    : contractArtifacts;

  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    return [];
  }

  return artifacts.map((artifact, index) => {
    const ruleId =
      typeof artifact.ruleId === 'string' && artifact.ruleId.length > 0
        ? artifact.ruleId
        : `${defaultFindingSource}-${index}`;
    const message = artifact.message || 'Contract finding';
    const severity: Finding['severity'] = artifact.severity || 'warning';
    const range = normalizeRange(artifact);
    const file = artifact.file || defaultFindingSource;
    const findingSource: FindingSource = defaultFindingSource;
    const impactHint: Finding['impactHint'] = artifact.impactHint || 'medium';
    const finding: Finding = {
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
  async estimateFileCount(rootDir: string, include?: string[], ignore?: string[]): Promise<number> {
    try {
      const files = await discoverFiles({ rootDir, include, ignore });
      return files.length;
    } catch (error) {
      // 如果预估失败，返回一个安全值以继续处理
      return 0;
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

    // 检查 Core 是否已初始化
    if (!isReady()) {
      throw new CoreNotReadyError();
    }

    // 加载规则
    const rules = rulePatterns && rulePatterns.length > 0
      ? await loadRuleFiles(rulePatterns)
      : [];

    // 预估文件数量
    const estimatedCount = await this.estimateFileCount(rootDir, include, ignore);

    // 检查文件数限制（硬约束 #4）
    if (estimatedCount > SCAN_LIMITS.maxFilesPerSyncScan) {
      throw new ScanTooLargeError(SCAN_LIMITS.maxFilesPerSyncScan, estimatedCount);
    }

    // 检查取消信号
    if (signal.aborted) {
      throw new Error('Scan aborted');
    }

    // 执行扫描
    const result = await scan({
      project,
      rootDir,
      include,
      ignore,
      rules,
      includeStats,
      deterministic,
      signal,
    });

    const parsedArtifacts = parseArtifactInputs({
      openApiDocuments,
      openApiComparisons,
      schemaDocuments,
      schemaComparisons,
      contractArtifacts,
      schemaArtifacts,
      runtimeConfig: PARSER_CONFIG,
    });

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
      return result as unknown as ScanResult;
    }

    const mergedFindings = [
      ...(result.findings as Finding[]),
      ...contractFindings,
      ...schemaFindings,
    ];

    if (deterministic) {
      mergedFindings.sort(deterministicSortFindings);
    }

    return {
      ...result,
      findings: mergedFindings as Finding[],
    } as unknown as ScanResult;
  }
}

// 导出单例实例
export const scanService = new ScanService();
