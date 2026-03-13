/**
 * los-ast 证据生成服务
 * Phase 1.7: los-ast 证据生成
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { getProjectAdapter } from '@los-ast/adapters';
import type {
  CodeEvidenceBundle,
  GenerateEvidenceRequest,
  ValidatePatchSafetyRequest,
  ValidatePatchSafetyResponse,
  GenerateRewriteRequest,
  GenerateRewriteResponse,
  ExplainCodeRequest,
  ExplainCodeResponse,
  CodeStats,
  EvidenceSignature,
  VerifiedScope,
} from '@los-ast/shared/types';
import { generateId } from '../../utils/id-generator.js';
import { discoverFiles, explainAtPosition, isReady, languageFromFilePath, loadRuleFiles, scan } from '@los-ast/core';
import { EVIDENCE_CONFIG } from '../../config/index.js';
import { CoreNotReadyError } from '../../types/errors.js';
import { clearEvidenceStore as clearEvidenceBundleStore, getStoredEvidenceBundle, saveEvidenceBundle } from './store.js';
import {
  buildEvidenceBundle,
  buildExplainCodeErrorResponse,
  buildExplainCodeResponse,
  buildPatchSafetyValidation,
  buildRewriteCandidates,
} from './builders.js';

function ensureCoreReady() {
  if (!isReady()) {
    throw new CoreNotReadyError();
  }
}

function createEmptyCodeStats(): CodeStats {
  return {
    total_files: 0,
    total_lines: 0,
    by_language: {},
    by_severity: {},
  };
}

function resolveStatsWorkspace(project: string) {
  if (!project || project === 'custom') {
    return null;
  }

  try {
    return getProjectAdapter(project);
  } catch {
    return null;
  }
}

function detectStatsLanguage(filePath: string): string {
  const language = languageFromFilePath(filePath);
  if (language) {
    return String(language);
  }

  const extension = path.extname(filePath).replace(/^\./u, '').trim().toLowerCase();
  return extension || 'unknown';
}

function countFileLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }

  return content.split(/\r?\n/u).length;
}

async function generateSignature(bundle: Omit<CodeEvidenceBundle, 'signature'>, scope: VerifiedScope): Promise<EvidenceSignature | undefined> {
  if (!EVIDENCE_CONFIG.enableSignatures || !EVIDENCE_CONFIG.signingKey) {
    return undefined;
  }

  const crypto = await import('crypto');
  const content = JSON.stringify({
    bundle_id: bundle.bundle_id,
    project: bundle.project,
    created_at: bundle.created_at,
    findings_count: bundle.findings.length,
    actor_id: scope.actor_id,
    tenant_id: scope.tenant_id,
    project_id: scope.project_id,
  });

  const signature = crypto
    .createHmac('sha256', EVIDENCE_CONFIG.signingKey)
    .update(content)
    .digest('base64url');

  return {
    algorithm: 'hmac-sha256',
    value: signature,
    key_id: EVIDENCE_CONFIG.signingKey.slice(0, 8),
    signed_at: new Date().toISOString(),
    signed_by: scope.actor_id,
  };
}

/**
 * 生成证据包
 */
export async function generateEvidence(
  request: GenerateEvidenceRequest,
  scope: VerifiedScope
): Promise<CodeEvidenceBundle> {
  ensureCoreReady();

  const bundleId = generateId('evd');
  const rules = request.rules && request.rules.length > 0
    ? await loadRuleFiles(request.rules)
    : [];

  const scanResult = await scan({
    project: request.project,
    rootDir: request.root_dir,
    include: request.include,
    ignore: request.ignore,
    rules,
    deterministic: request.deterministic ?? false,
  });

  const bundle = buildEvidenceBundle(
    bundleId,
    request,
    scope,
    scanResult.findings,
    new Date().toISOString(),
  );

  const signature = await generateSignature(bundle, scope);
  if (signature) {
    bundle.signature = signature;
  }

  saveEvidenceBundle(bundle);
  console.log(`[EvidenceService] Generated evidence bundle ${bundleId} by ${bundle.actor.actor_id}`);

  return bundle;
}

/**
 * 验证 Patch 安全性
 */
export async function validatePatchSafety(
  request: ValidatePatchSafetyRequest
): Promise<ValidatePatchSafetyResponse> {
  return buildPatchSafetyValidation(request);
}

/**
 * 生成改写候选
 */
export async function generateRewrite(request: GenerateRewriteRequest): Promise<GenerateRewriteResponse> {
  return buildRewriteCandidates(request);
}

/**
 * 解释代码
 */
export async function explainCode(request: ExplainCodeRequest): Promise<ExplainCodeResponse> {
  ensureCoreReady();

  try {
    const result = await explainAtPosition({
      file: request.file_path,
      line: request.line,
      column: request.column,
      rootDir: process.cwd(),
    });
    return buildExplainCodeResponse(result);
  } catch (error) {
    return buildExplainCodeErrorResponse(error);
  }
}

/**
 * 获取证据包
 */
export async function getEvidenceBundle(
  bundleId: string,
  scope?: { tenant_id?: string; project_id?: string }
): Promise<CodeEvidenceBundle | null> {
  const bundle = getStoredEvidenceBundle(bundleId);
  if (!bundle) {
    return null;
  }

  if (
    scope?.tenant_id &&
    scope?.project_id &&
    (bundle.scope.tenant_id !== scope.tenant_id || bundle.scope.project_id !== scope.project_id)
  ) {
    return null;
  }

  return bundle;
}

/**
 * 获取代码统计
 */
export async function getCodeStats(project: string): Promise<CodeStats> {
  ensureCoreReady();

  const workspace = resolveStatsWorkspace(project);
  if (!workspace) {
    return createEmptyCodeStats();
  }

  const stats = createEmptyCodeStats();
  const files = await discoverFiles({
    rootDir: workspace.rootDir,
    include: workspace.include,
    ignore: workspace.ignore,
  });

  stats.total_files = files.length;

  for (const file of files) {
    const content = await fs.readFile(file, 'utf-8');
    stats.total_lines += countFileLines(content);

    const language = detectStatsLanguage(file);
    stats.by_language[language] = (stats.by_language[language] || 0) + 1;
  }

  if (workspace.ruleGlobs.length > 0) {
    const rules = await loadRuleFiles(workspace.ruleGlobs);
    const scanResult = await scan({
      project: workspace.project,
      rootDir: workspace.rootDir,
      include: workspace.include,
      ignore: workspace.ignore,
      rules,
      deterministic: true,
    });

    for (const finding of scanResult.findings) {
      stats.by_severity[finding.severity] = (stats.by_severity[finding.severity] || 0) + 1;
    }
  }

  return stats;
}

/**
 * 清空存储 (用于测试)
 */
export function clearEvidenceStore(): void {
  clearEvidenceBundleStore();
}
