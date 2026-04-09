/**
 * los-ast 证据生成服务
 * Phase 1.7: los-ast 证据生成
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { getProjectAdapter } from '@los-ast/adapters';
import { generateId } from '../../utils/id-generator.js';
import { discoverFiles, explainAtPosition, isReady, languageFromFilePath, loadRuleFiles, scan } from '@los-ast/core';
import { EVIDENCE_CONFIG } from '../../config/index.js';
import { CoreNotReadyError } from '../../types/errors.js';
import { clearEvidenceStore as clearEvidenceBundleStore, getStoredEvidenceBundle, saveEvidenceBundle } from './store.js';
import { buildEvidenceBundle, buildExplainCodeErrorResponse, buildExplainCodeResponse, buildPatchSafetyValidation, buildRewriteCandidates, } from './builders.js';
function ensureCoreReady() {
    if (!isReady()) {
        throw new CoreNotReadyError();
    }
}
function createEmptyCodeStats() {
    return {
        total_files: 0,
        total_lines: 0,
        by_language: {},
        by_severity: {},
    };
}
function resolveStatsWorkspace(project) {
    if (!project || project === 'custom') {
        return null;
    }
    try {
        return getProjectAdapter(project);
    }
    catch {
        return null;
    }
}
function detectStatsLanguage(filePath) {
    const language = languageFromFilePath(filePath);
    if (language) {
        return String(language);
    }
    const extension = path.extname(filePath).replace(/^\./u, '').trim().toLowerCase();
    return extension || 'unknown';
}
function countFileLines(content) {
    if (content.length === 0) {
        return 0;
    }
    return content.split(/\r?\n/u).length;
}
async function generateSignature(bundle, scope) {
    if (!EVIDENCE_CONFIG.enableSignatures || !EVIDENCE_CONFIG.signingKey) {
        return undefined;
    }
    const crypto = await import('crypto');
    // Include scope-bound metadata in signature to prevent scope tampering
    const content = JSON.stringify({
        bundle_id: bundle.bundle_id,
        project: bundle.project,
        created_at: bundle.created_at,
        findings_count: bundle.findings.length,
        actor_id: scope.actor_id,
        tenant_id: scope.tenant_id,
        project_id: scope.project_id,
        identity_source: scope.identity_source,
        identity_verified: scope.identity_verified,
        scope_mode: scope.mode,
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
export async function generateEvidence(request, scope) {
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
    const bundle = buildEvidenceBundle(bundleId, request, scope, scanResult.findings, new Date().toISOString());
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
export async function validatePatchSafety(request) {
    return buildPatchSafetyValidation(request);
}
/**
 * 生成改写候选
 */
export async function generateRewrite(request) {
    return buildRewriteCandidates(request);
}
/**
 * 解释代码
 */
export async function explainCode(request) {
    ensureCoreReady();
    try {
        const result = await explainAtPosition({
            file: request.file_path,
            line: request.line,
            column: request.column,
            rootDir: process.cwd(),
        });
        return buildExplainCodeResponse(result);
    }
    catch (error) {
        return buildExplainCodeErrorResponse(error);
    }
}
/**
 * 获取证据包
 */
export async function getEvidenceBundle(bundleId, scope) {
    const bundle = getStoredEvidenceBundle(bundleId);
    if (!bundle) {
        return null;
    }
    if (scope?.tenant_id &&
        scope?.project_id &&
        (bundle.scope.tenant_id !== scope.tenant_id || bundle.scope.project_id !== scope.project_id)) {
        return null;
    }
    return bundle;
}
/**
 * 获取代码统计
 */
export async function getCodeStats(project) {
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
 * 验证证据包签名
 * @returns 验证结果，包含是否有效和失败原因
 */
export async function verifyEvidenceSignature(bundle) {
    if (!bundle.signature) {
        return { valid: false, reason: 'No signature present' };
    }
    if (bundle.signature.algorithm !== 'hmac-sha256') {
        return { valid: false, reason: `Unsupported algorithm: ${bundle.signature.algorithm}` };
    }
    if (!EVIDENCE_CONFIG.signingKey) {
        return { valid: false, reason: 'Signing key not configured' };
    }
    const crypto = await import('crypto');
    // Reconstruct the signed content with scope-bound metadata
    const content = JSON.stringify({
        bundle_id: bundle.bundle_id,
        project: bundle.project,
        created_at: bundle.created_at,
        findings_count: bundle.findings.length,
        actor_id: bundle.actor.actor_id,
        tenant_id: bundle.scope.tenant_id,
        project_id: bundle.scope.project_id,
        identity_source: bundle.actor.identity_source,
        identity_verified: bundle.actor.identity_verified,
        scope_mode: 'service', // Default for signed bundles
    });
    const expectedSignature = crypto
        .createHmac('sha256', EVIDENCE_CONFIG.signingKey)
        .update(content)
        .digest('base64url');
    try {
        const actualBuf = Buffer.from(bundle.signature.value);
        const expectedBuf = Buffer.from(expectedSignature);
        if (actualBuf.length !== expectedBuf.length) {
            return { valid: false, reason: 'Signature mismatch' };
        }
        const equal = crypto.timingSafeEqual(actualBuf, expectedBuf);
        if (!equal) {
            return { valid: false, reason: 'Signature mismatch' };
        }
        return { valid: true };
    }
    catch {
        return { valid: false, reason: 'Signature verification error' };
    }
}
/**
 * 清空存储 (用于测试)
 */
export function clearEvidenceStore() {
    clearEvidenceBundleStore();
}
