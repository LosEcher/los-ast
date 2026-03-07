/**
 * los-ast 证据生成服务
 * Phase 1.7: los-ast 证据生成
 */

import type {
  CodeEvidenceBundle,
  GenerateEvidenceRequest,
  ValidatePatchSafetyRequest,
  ValidatePatchSafetyResponse,
  GenerateRewriteRequest,
  GenerateRewriteResponse,
  RewriteCandidate,
  ExplainCodeRequest,
  ExplainCodeResponse,
  CodeStats,
  CodeSnippet,
  CodeSymbolInfo,
  CodeImpactReport,
  CodeASTNode,
} from '@los-ast/shared/types';
import { generateId } from '../../utils/id-generator.js';
import { scan, explainAtPosition } from '@los-ast/core';

// 内存存储
const evidenceStore: Map<string, CodeEvidenceBundle> = new Map();

/**
 * 生成证据包
 */
export async function generateEvidence(request: GenerateEvidenceRequest): Promise<CodeEvidenceBundle> {
  const bundleId = generateId('evd');

  // 执行扫描获取完整结果
  const scanResult = await scan({
    project: request.project,
    rootDir: request.root_dir,
  });

  // 构建代码片段
  const codeSnippets: CodeSnippet[] = [];
  if (request.include_context !== false) {
    for (const finding of scanResult.findings) {
      codeSnippets.push({
        snippet_id: `snp_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
        file_path: finding.filePath,
        language: 'typescript', // 应该从 finding 获取
        content: '',
        range: {
          start: { line: finding.line, column: finding.column, index: 0 },
          end: { line: finding.line, column: finding.column + 10, index: 0 },
        },
        surrounding_context: {
          before: '',
          after: '',
        },
      });
    }
  }

  // 构建符号索引
  const symbolIndex: CodeSymbolInfo[] = [];
  if (request.include_symbols !== false) {
    // 简化实现 - 实际应该调用 los-ast 的符号发现功能
    symbolIndex.push({
      symbol_id: `sym_${Date.now()}`,
      name: 'main',
      kind: 'function',
      file_path: request.root_dir,
      range: {
        start: { line: 1, column: 0, index: 0 },
        end: { line: 10, column: 0, index: 0 },
      },
      references: [],
    });
  }

  const bundle: CodeEvidenceBundle = {
    bundle_id: bundleId,
    project: request.project,
    root_dir: request.root_dir,
    created_at: new Date().toISOString(),
    findings: scanResult.findings.map((f) => ({
      ...f,
      evidence_type: 'finding',
      full_context: '',
      ast_nodes: request.include_ast !== false ? generateASTNodes(f) : [],
    })),
    code_snippets: codeSnippets,
    symbol_index: symbolIndex,
    impact_report: generateImpactReport(scanResult),
  };

  evidenceStore.set(bundleId, bundle);
  console.log(`[EvidenceService] Generated evidence bundle ${bundleId}`);

  return bundle;
}

/**
 * 生成 AST 节点（简化实现）
 */
function generateASTNodes(finding: any): CodeASTNode[] {
  return [
    {
      node_id: `node_${Date.now()}`,
      type: 'call_expression',
      text: finding.message,
      range: {
        start: { line: finding.line, column: finding.column, index: 0 },
        end: { line: finding.line, column: finding.column + 10, index: 0 },
      },
      children: [],
      properties: {},
    },
  ];
}

/**
 * 生成影响报告
 */
function generateImpactReport(scanResult: any): CodeImpactReport {
  return {
    files_affected: new Set(scanResult.findings.map((f: any) => f.filePath)).size,
    symbols_affected: scanResult.findings.length,
    tests_affected: 0,
    complexity_score: Math.min(scanResult.findings.length * 0.1, 10),
    risk_assessment: scanResult.findings.length > 10 ? 'high' : scanResult.findings.length > 5 ? 'medium' : 'low',
  };
}

/**
 * 验证 Patch 安全性
 */
export async function validatePatchSafety(
  request: ValidatePatchSafetyRequest
): Promise<ValidatePatchSafetyResponse> {
  // 模拟 Patch 安全性验证
  const conflicts: ValidatePatchSafetyResponse['conflicts'] = [];

  // 简单的语法检查模拟
  if (!request.proposed_patch.includes('\n') && request.proposed_patch.length > 100) {
    conflicts.push({
      type: 'syntax',
      file_path: request.original_file,
      message: 'Patch appears to be missing line breaks',
      severity: 'warning',
    });
  }

  const safe = conflicts.length === 0;

  return {
    safe,
    conflicts,
    impact_estimate: {
      files_affected: safe ? 1 : 0,
      symbols_affected: safe ? 1 : 0,
    },
  };
}

/**
 * 生成改写候选
 */
export async function generateRewrite(request: GenerateRewriteRequest): Promise<GenerateRewriteResponse> {
  const candidates: RewriteCandidate[] = [];
  let ready = 0;
  let blocked = 0;

  for (const finding of request.findings) {
    if (!finding.approved) {
      blocked++;
      continue;
    }

    const candidate: RewriteCandidate = {
      candidate_id: `cand_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
      finding_id: finding.finding_id,
      file_path: 'src/index.ts', // 应该从 finding 获取
      original_code: 'console.log("debug")',
      proposed_code: finding.suggested_fix || '// Removed debug code',
      explanation: `Fix for ${finding.finding_id}`,
      safety_score: request.options.safety_level === 'strict' ? 0.95 : 0.8,
      ready_to_apply: request.options.safety_level !== 'strict',
    };

    if (!candidate.ready_to_apply) {
      candidate.blockers = ['Safety level strict requires manual review'];
      blocked++;
    } else {
      ready++;
    }

    candidates.push(candidate);
  }

  return {
    candidates,
    summary: {
      total: candidates.length,
      ready,
      blocked,
    },
  };
}

/**
 * 解释代码
 */
export async function explainCode(request: ExplainCodeRequest): Promise<ExplainCodeResponse> {
  // 使用 los-ast Core 的 explainAtPosition 功能
  try {
    const result = await explainAtPosition({
      filePath: request.file_path,
      line: request.line,
      column: request.column,
      rootDir: process.cwd(),
    });

    return {
      explanation: result.explanation,
      symbols:
        result.symbols?.map((s) => ({
          symbol_id: `sym_${Date.now()}`,
          name: s.name,
          kind: s.kind as any,
          file_path: s.location.file,
          range: {
            start: { line: s.location.line, column: s.location.column, index: 0 },
            end: { line: s.location.line, column: s.location.column + 10, index: 0 },
          },
          references: [],
        })) || [],
      related_findings: [],
    };
  } catch (error) {
    return {
      explanation: `Error explaining code: ${error instanceof Error ? error.message : 'Unknown error'}`,
      symbols: [],
      related_findings: [],
    };
  }
}

/**
 * 获取证据包
 */
export async function getEvidenceBundle(bundleId: string): Promise<CodeEvidenceBundle | null> {
  return evidenceStore.get(bundleId) || null;
}

/**
 * 获取代码统计
 */
export async function getCodeStats(_project: string): Promise<CodeStats> {
  // 模拟代码统计
  return {
    total_files: 42,
    total_lines: 1234,
    by_language: {
      typescript: 25,
      javascript: 10,
      json: 7,
    },
    by_severity: {
      error: 5,
      warning: 12,
      info: 8,
    },
  };
}

/**
 * 清空存储 (用于测试)
 */
export function clearEvidenceStore(): void {
  evidenceStore.clear();
}
