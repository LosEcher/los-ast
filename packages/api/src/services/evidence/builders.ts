import type {
  CodeASTNode,
  CodeEvidenceBundle,
  CodeImpactReport,
  CodeSnippet,
  CodeSymbolInfo,
  CoreFinding,
  EvidenceActor,
  ExplainCodeResponse,
  EvidenceFinding,
  GenerateEvidenceRequest,
  GenerateRewriteRequest,
  GenerateRewriteResponse,
  RewriteCandidate,
  ValidatePatchSafetyRequest,
  ValidatePatchSafetyResponse,
  VerifiedScope,
} from '@los-ast/shared/types';

const EVIDENCE_SCHEMA_VERSION = '1.0.0';
const EVIDENCE_GENERATOR_VERSION = '1.0.0';

function createEphemeralId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export function buildEvidenceActor(scope: VerifiedScope): EvidenceActor {
  return {
    actor_id: scope.actor_id,
    identity_source: scope.identity_source,
    identity_verified: scope.identity_verified,
  };
}

export function buildCodeSnippets(findings: CoreFinding[], enabled: boolean): CodeSnippet[] {
  if (!enabled) {
    return [];
  }

  return findings.map((finding) => ({
    snippet_id: createEphemeralId('snp'),
    file_path: finding.file,
    language: finding.language,
    content: finding.excerpt,
    range: {
      start: { ...finding.range.start },
      end: { ...finding.range.end },
    },
    surrounding_context: {
      before: '',
      after: '',
    },
  }));
}

export function buildSymbolIndex(rootDir: string, enabled: boolean): CodeSymbolInfo[] {
  if (!enabled) {
    return [];
  }

  return [
    {
      symbol_id: createEphemeralId('sym'),
      name: 'main',
      kind: 'function',
      file_path: rootDir,
      range: {
        start: { line: 1, column: 0, index: 0 },
        end: { line: 10, column: 0, index: 0 },
      },
      references: [],
    },
  ];
}

export function buildEvidenceFindingAstNodes(finding: Partial<CoreFinding>): CodeASTNode[] {
  return [
    {
      node_id: createEphemeralId('node'),
      type: 'call_expression',
      text: finding.message ?? '',
      range: {
        start: {
          line: finding.range?.start?.line ?? 0,
          column: finding.range?.start?.column ?? 0,
          index: finding.range?.start?.index ?? 0,
        },
        end: {
          line: finding.range?.end?.line ?? 0,
          column: finding.range?.end?.column ?? 0,
          index: finding.range?.end?.index ?? 0,
        },
      },
      children: [],
      properties: {},
    },
  ];
}

export function buildEvidenceFindings(findings: CoreFinding[], includeAst: boolean): EvidenceFinding[] {
  return findings.map((finding) => ({
    ...finding,
    evidence_type: 'finding',
    full_context: '',
    ast_nodes: includeAst ? buildEvidenceFindingAstNodes(finding) : [],
  }));
}

export function buildImpactReport(findings: CoreFinding[]): CodeImpactReport {
  return {
    files_affected: new Set(findings.map((finding) => finding.file)).size,
    symbols_affected: findings.length,
    tests_affected: 0,
    complexity_score: Math.min(findings.length * 0.1, 10),
    risk_assessment: findings.length > 10 ? 'high' : findings.length > 5 ? 'medium' : 'low',
  };
}

export function buildEvidenceBundle(
  bundleId: string,
  request: GenerateEvidenceRequest,
  scope: VerifiedScope,
  findings: CoreFinding[],
  createdAt: string,
): CodeEvidenceBundle {
  const actor = buildEvidenceActor(scope);

  return {
    bundle_id: bundleId,
    project: request.project,
    root_dir: request.root_dir,
    created_at: createdAt,
    scope: {
      tenant_id: scope.tenant_id,
      project_id: scope.project_id,
    },
    schema_version: EVIDENCE_SCHEMA_VERSION,
    generator: {
      tool: 'los-ast',
      version: EVIDENCE_GENERATOR_VERSION,
    },
    deterministic: request.deterministic ?? false,
    findings: buildEvidenceFindings(findings, request.include_ast !== false),
    code_snippets: buildCodeSnippets(findings, request.include_context !== false),
    symbol_index: buildSymbolIndex(request.root_dir, request.include_symbols !== false),
    impact_report: buildImpactReport(findings),
    actor,
  };
}

export function buildPatchSafetyValidation(
  request: ValidatePatchSafetyRequest,
): ValidatePatchSafetyResponse {
  const conflicts: ValidatePatchSafetyResponse['conflicts'] = [];

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

export function buildRewriteCandidates(
  request: GenerateRewriteRequest,
): GenerateRewriteResponse {
  const candidates: RewriteCandidate[] = [];
  let ready = 0;
  let blocked = 0;

  for (const finding of request.findings) {
    if (!finding.approved) {
      blocked++;
      continue;
    }

    const candidate: RewriteCandidate = {
      candidate_id: createEphemeralId('cand'),
      finding_id: finding.finding_id,
      file_path: 'src/index.ts',
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

export function buildExplainCodeResponse(result: {
  file: string;
  matches: Array<{
    severity: string;
    ruleId: string;
    message: string;
    range: {
      start: { line: number; column: number; index: number };
      end: { line: number; column: number; index: number };
    };
  }>;
}): ExplainCodeResponse {
  const explanation = result.matches.length > 0
    ? `Found ${result.matches.length} rule match(es) at this position:\n${result.matches.map((match) => `- [${match.severity}] ${match.ruleId}: ${match.message}`).join('\n')}`
    : 'No rule matches found at this position.';

  const symbols = result.matches.map((match) => ({
    symbol_id: createEphemeralId('sym'),
    name: match.ruleId,
    kind: 'function' as const,
    file_path: result.file,
    range: {
      start: { ...match.range.start },
      end: { ...match.range.end },
    },
    references: [],
  }));

  return {
    explanation,
    symbols,
    related_findings: [],
  };
}

export function buildExplainCodeErrorResponse(error: unknown): ExplainCodeResponse {
  return {
    explanation: `Error explaining code: ${error instanceof Error ? error.message : 'Unknown error'}`,
    symbols: [],
    related_findings: [],
  };
}
