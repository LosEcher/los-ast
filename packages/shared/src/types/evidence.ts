/**
 * los-ast 证据生成类型定义
 * Phase 1.7: los-ast 证据生成
 */

import type { Range } from './api.js';

/**
 * 代码证据包
 */
export interface CodeEvidenceBundle {
  bundle_id: string;
  project: string;
  root_dir: string;
  created_at: string;
  findings: EvidenceFinding[];
  code_snippets: CodeSnippet[];
  symbol_index: CodeSymbolInfo[];
  impact_report: CodeImpactReport;
}

/**
 * Core Finding (from @los-ast/core)
 */
export interface CoreFinding {
  filePath: string;
  line: number;
  column: number;
  message: string;
  rule: string;
  severity: 'error' | 'warning' | 'info';
}

export interface EvidenceFinding extends CoreFinding {
  evidence_type: 'finding';
  full_context: string;
  ast_nodes: CodeASTNode[];
}

export interface CodeSnippet {
  snippet_id: string;
  file_path: string;
  language: string;
  content: string;
  range: Range;
  surrounding_context: {
    before: string;
    after: string;
  };
}

export interface CodeSymbolInfo {
  symbol_id: string;
  name: string;
  kind: 'function' | 'class' | 'variable' | 'interface' | 'type' | 'module';
  file_path: string;
  range: Range;
  references: CodeReferenceInfo[];
}

export interface CodeReferenceInfo {
  file_path: string;
  range: Range;
  is_definition: boolean;
}

export interface CodeASTNode {
  node_id: string;
  type: string;
  text: string;
  range: Range;
  children: CodeASTNode[];
  properties: Record<string, unknown>;
}

export interface CodeImpactReport {
  files_affected: number;
  symbols_affected: number;
  tests_affected: number;
  complexity_score: number;
  risk_assessment: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * 生成证据包请求
 */
export interface GenerateEvidenceRequest {
  project: string;
  root_dir: string;
  findings: string[]; // finding IDs
  include_context?: boolean;
  include_ast?: boolean;
  include_symbols?: boolean;
}

/**
 * 验证 Patch 安全性请求
 */
export interface ValidatePatchSafetyRequest {
  project: string;
  original_file: string;
  proposed_patch: string;
}

export interface ValidatePatchSafetyResponse {
  safe: boolean;
  conflicts: PatchConflict[];
  impact_estimate: {
    files_affected: number;
    symbols_affected: number;
  };
}

export interface PatchConflict {
  type: 'syntax' | 'semantic' | 'dependency';
  file_path: string;
  message: string;
  severity: 'warning' | 'error';
}

/**
 * 生成改写候选请求
 */
export interface GenerateRewriteRequest {
  project: string;
  findings: FindingApproval[];
  options: {
    dry_run: boolean;
    max_candidates: number;
    safety_level: 'strict' | 'moderate' | 'lenient';
  };
}

export interface FindingApproval {
  finding_id: string;
  approved: boolean;
  proposed_fix?: string;
}

export interface GenerateRewriteResponse {
  candidates: RewriteCandidate[];
  summary: {
    total: number;
    ready: number;
    blocked: number;
  };
}

export interface RewriteCandidate {
  candidate_id: string;
  finding_id: string;
  file_path: string;
  original_code: string;
  proposed_code: string;
  explanation: string;
  safety_score: number;
  ready_to_apply: boolean;
  blockers?: string[];
}

/**
 * 代码解释请求
 */
export interface ExplainCodeRequest {
  file_path: string;
  line: number;
  column: number;
  context_lines?: number;
}

export interface ExplainCodeResponse {
  explanation: string;
  symbols: CodeSymbolInfo[];
  related_findings: string[];
}

/**
 * 代码统计
 */
export interface CodeStats {
  total_files: number;
  total_lines: number;
  by_language: Record<string, number>;
  by_severity: Record<string, number>;
}
