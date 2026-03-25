import { describe, expect, it } from 'vitest';
import type { Finding } from '@los-ast/shared/types';
import {
  buildFindingsFromArtifacts,
  buildScanTelemetry,
  deterministicSortFindings,
  mergeScanResultFindings,
  normalizeGovernanceDomain,
  normalizeRange,
  requiresCodeScan,
  resolveScanMode,
  toContractFindingFingerprint,
} from '../../../src/services/scan-service/shared';

describe('scan service shared helpers', () => {
  it('normalizes ranges and governance domains conservatively', () => {
    expect(normalizeRange({ line: 0, column: -3, startIndex: -5 })).toEqual({
      start: { line: 1, column: 0, index: 0 },
      end: { line: 1, column: 1, index: 1 },
    });

    expect(normalizeGovernanceDomain(' backend ')).toEqual(['backend']);
    expect(normalizeGovernanceDomain([' api ', '', 1, 'security'])).toEqual(['api', 'security']);
    expect(normalizeGovernanceDomain(undefined)).toBeUndefined();
  });

  it('builds deterministic contract findings and sorts merged findings stably', () => {
    const findings = buildFindingsFromArtifacts({
      project: 'test-project',
      deterministic: true,
      defaultFindingSource: 'contract',
      contractArtifacts: [
        {
          source: 'contract-baseline',
          message: 'Missing auth requirement',
          file: '/tmp/openapi.yaml',
          line: 12,
          column: 4,
        },
      ],
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      timestamp: '1970-01-01T00:00:00.000Z',
      ruleId: 'contract-0',
      findingSource: 'contract',
      ruleFile: 'contract-baseline',
    });
    expect(findings[0].fingerprint).toHaveLength(32);

    const astFinding: Finding = {
      tool: 'los-ast',
      version: 0,
      timestamp: '1970-01-01T00:00:00.000Z',
      project: 'test-project',
      ruleFile: 'rules.yml',
      ruleId: 'ast-rule',
      findingSource: 'ast',
      severity: 'warning',
      message: 'AST finding',
      file: '/tmp/openapi.yaml',
      language: 'typescript',
      range: findings[0].range,
      excerpt: 'AST finding',
      hasFix: false,
      proposedReplacement: null,
      fingerprint: 'aaa',
    };

    const merged = mergeScanResultFindings({
      result: {
        filesScanned: 1,
        findings: [findings[0], astFinding],
      },
      contractFindings: [],
      schemaFindings: [],
      deterministic: true,
    });

    expect(merged.findings[0]?.ruleId).toBe('ast-rule');
    expect([...merged.findings].sort(deterministicSortFindings).map((item) => item.ruleId)).toEqual([
      'ast-rule',
      'contract-0',
    ]);
  });

  it('derives scan mode, telemetry, code-scan need, and stable fingerprints', () => {
    expect(resolveScanMode({ shouldRunAstScan: true, hasNativeArtifacts: true })).toBe('hybrid');
    expect(resolveScanMode({ shouldRunAstScan: true, hasNativeArtifacts: false })).toBe('ast');
    expect(resolveScanMode({ shouldRunAstScan: false, hasNativeArtifacts: true })).toBe('native_only');

    expect(requiresCodeScan({ includeStats: true })).toBe(false);
    expect(requiresCodeScan({ rules: ['rules/**/*.yml'] })).toBe(true);

    const range = {
      start: { line: 1, column: 0, index: 0 },
      end: { line: 1, column: 1, index: 1 },
    };
    const fullFingerprint = toContractFindingFingerprint({
      project: 'test-project',
      file: '/tmp/openapi.yaml',
      ruleId: 'contract/auth',
      range,
      message: 'Missing auth',
    }, false);
    const deterministicFingerprint = toContractFindingFingerprint({
      project: 'test-project',
      file: '/tmp/openapi.yaml',
      ruleId: 'contract/auth',
      range,
      message: 'Missing auth',
    }, true);
    expect(deterministicFingerprint).toBe(fullFingerprint.slice(0, 32));

    const telemetry = buildScanTelemetry({
      startedAt: Date.now() - 50,
      shouldRunAstScan: false,
      hasNativeArtifacts: true,
      explicitRulePatterns: 0,
      loadedRules: 0,
      nativeInputCounts: {
        openApiDocuments: 1,
        openApiComparisons: 0,
        schemaDocuments: 0,
        schemaComparisons: 0,
        contractArtifacts: 0,
        schemaArtifacts: 0,
      },
    });

    expect(telemetry).toMatchObject({
      mode: 'native_only',
      explicitRulePatterns: 0,
      loadedRules: 0,
      nativeInputs: {
        openApiDocuments: 1,
      },
    });
    expect(telemetry.durationMs).toEqual(expect.any(Number));
  });
});
