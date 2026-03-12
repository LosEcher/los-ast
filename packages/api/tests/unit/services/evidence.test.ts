import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateEvidence,
  getEvidenceBundle,
  clearEvidenceStore,
} from '../../../src/services/evidence/service';
import * as core from '@los-ast/core';
import type { GenerateEvidenceRequest, VerifiedScope } from '@los-ast/shared/types';

vi.mock('../../../src/config/index.js', async () => {
  return {
    EVIDENCE_CONFIG: {
      signingKey: 'test-signing-key-for-evidence-signatures',
      enableSignatures: true,
    },
    PERSISTENCE_CONFIG: {
      experimentalStoreBackend: 'memory',
      experimentalStoreDir: undefined,
      experimentalSqlitePath: undefined,
    },
  };
});

vi.mock('@los-ast/core', () => ({
  scan: vi.fn().mockResolvedValue({
    findings: [
      {
        tool: 'los-ast',
        version: 1,
        timestamp: '2024-01-01T00:00:00Z',
        project: 'test-project',
        ruleFile: 'test.yml',
        ruleId: 'test-rule',
        severity: 'warning',
        message: 'Test finding',
        file: 'src/index.ts',
        language: 'typescript',
        range: {
          start: { line: 1, column: 0, index: 0 },
          end: { line: 2, column: 10, index: 20 },
        },
        excerpt: 'console.log("test")',
        hasFix: false,
        proposedReplacement: null,
        fingerprint: 'fp-123',
      },
    ],
  }),
  isReady: vi.fn().mockReturnValue(true),
  loadRuleFiles: vi.fn().mockResolvedValue([]),
}));

describe('Evidence Service', () => {
  const mockScope: VerifiedScope = {
    tenant_id: 'test-tenant',
    project_id: 'test-project',
    actor_id: 'test-actor',
    mode: 'service',
    identity_verified: true,
    identity_source: 'jwt',
  };

  beforeEach(() => {
    clearEvidenceStore();
  });

  describe('generateEvidence', () => {
    it('should generate evidence bundle with actor information', async () => {
      const request: GenerateEvidenceRequest = {
        project: 'test-project',
        root_dir: '/test/path',
        findings: [],
      };

      const bundle = await generateEvidence(request, mockScope);

      expect(bundle.bundle_id).toMatch(/^evd_/);
      expect(bundle.actor).toBeDefined();
      expect(bundle.actor.actor_id).toBe('test-actor');
      expect(bundle.actor.identity_source).toBe('jwt');
      expect(bundle.actor.identity_verified).toBe(true);
    });

    it('should generate evidence bundle with signature when signing key is configured', async () => {
      const request: GenerateEvidenceRequest = {
        project: 'test-project',
        root_dir: '/test/path',
        findings: [],
      };

      const bundle = await generateEvidence(request, mockScope);

      expect(bundle.signature).toBeDefined();
      expect(bundle.signature?.algorithm).toBe('hmac-sha256');
      expect(bundle.signature?.signed_by).toBe('test-actor');
      expect(bundle.signature?.value).toBeTruthy();
      expect(bundle.signature?.signed_at).toBeTruthy();
      expect(bundle.signature?.key_id).toBeDefined();
    });

    it('should include schema version and generator info', async () => {
      const request: GenerateEvidenceRequest = {
        project: 'test-project',
        root_dir: '/test/path',
        findings: [],
      };

      const bundle = await generateEvidence(request, mockScope);

      expect(bundle.schema_version).toBe('1.0.0');
      expect(bundle.generator.tool).toBe('los-ast');
      expect(bundle.generator.version).toBe('1.0.0');
    });

    it('should store bundle and allow retrieval', async () => {
      const request: GenerateEvidenceRequest = {
        project: 'test-project',
        root_dir: '/test/path',
        findings: [],
      };

      const bundle = await generateEvidence(request, mockScope);
      const retrieved = await getEvidenceBundle(bundle.bundle_id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.bundle_id).toBe(bundle.bundle_id);
      expect(retrieved?.actor.actor_id).toBe('test-actor');
    });

    it('should not retrieve evidence bundle across tenant/project scope boundary', async () => {
      const request: GenerateEvidenceRequest = {
        project: 'test-project',
        root_dir: '/test/path',
        findings: [],
      };

      const bundle = await generateEvidence(request, mockScope);
      const crossTenant = await getEvidenceBundle(bundle.bundle_id, {
        tenant_id: 'other-tenant',
        project_id: 'other-project',
      });

      expect(crossTenant).toBeNull();
    });

    it('should throw CORE_NOT_READY when core is not ready', async () => {
      const readySpy = vi.mocked(core.isReady);
      readySpy.mockReturnValue(false);
      try {
        const request: GenerateEvidenceRequest = {
          project: 'test-project',
          root_dir: '/test/path',
          findings: [],
        };

        await expect(generateEvidence(request, mockScope)).rejects.toMatchObject({
          category: 'SERVICE_UNAVAILABLE',
          code: 'CORE_NOT_READY',
          message: 'Core is not ready',
        });
      } finally {
        readySpy.mockReturnValue(true);
      }
    });
  });

  describe('scope validation in evidence', () => {
    it('should use verified scope actor_id even if request has different actor', async () => {
      const request: GenerateEvidenceRequest = {
        project: 'test-project',
        root_dir: '/test/path',
        findings: [],
        scope: {
          tenant_id: 'request-tenant',
          project_id: 'request-project',
          actor_id: 'request-actor',
        },
      };

      const verifiedScope: VerifiedScope = {
        tenant_id: 'verified-tenant',
        project_id: 'verified-project',
        actor_id: 'verified-actor',
        mode: 'service',
        identity_verified: true,
        identity_source: 'jwt',
      };

      const bundle = await generateEvidence(request, verifiedScope);

      expect(bundle.actor.actor_id).toBe('verified-actor');
    });
  });
});
