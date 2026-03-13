import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import {
  generateEvidence,
  getCodeStats,
  getEvidenceBundle,
  clearEvidenceStore,
} from '../../../src/services/evidence/service';
import * as core from '@los-ast/core';
import * as adapters from '@los-ast/adapters';
import type { GenerateEvidenceRequest, VerifiedScope } from '@los-ast/shared/types';

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(),
  },
}));

vi.mock('@los-ast/adapters', () => ({
  getProjectAdapter: vi.fn(),
}));

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
  discoverFiles: vi.fn().mockResolvedValue([]),
  isReady: vi.fn().mockReturnValue(true),
  languageFromFilePath: vi.fn((file: string) => (
    file.endsWith('.ts') ? 'typescript' : null
  )),
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
    vi.clearAllMocks();
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

  describe('getCodeStats', () => {
    it('should derive stats from the resolved project workspace', async () => {
      vi.mocked(adapters.getProjectAdapter).mockReturnValue({
        project: 'lsclaw',
        rootDir: '/workspace/lsclaw',
        include: ['src/**/*.ts', 'README.md'],
        ignore: ['**/node_modules/**'],
        ruleGlobs: ['rules/projects/lsclaw/**/*.yml'],
      });

      vi.mocked(core.discoverFiles).mockResolvedValue([
        '/workspace/lsclaw/src/index.ts',
        '/workspace/lsclaw/README.md',
      ]);

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce('const answer = 42;\nconsole.log(answer)')
        .mockResolvedValueOnce('# los-ast');

      vi.mocked(core.languageFromFilePath).mockImplementation((file: string) => (
        file.endsWith('.ts') ? 'typescript' : null
      ));

      vi.mocked(core.loadRuleFiles).mockResolvedValue([
        { id: 'demo', language: 'typescript' },
      ] as Awaited<ReturnType<typeof core.loadRuleFiles>>);

      vi.mocked(core.scan).mockResolvedValue({
        findings: [
          { severity: 'warning' },
          { severity: 'warning' },
          { severity: 'error' },
        ],
      } as Awaited<ReturnType<typeof core.scan>>);

      const stats = await getCodeStats('lsclaw');

      expect(stats).toEqual({
        total_files: 2,
        total_lines: 3,
        by_language: {
          typescript: 1,
          md: 1,
        },
        by_severity: {
          warning: 2,
          error: 1,
        },
      });

      expect(core.discoverFiles).toHaveBeenCalledWith({
        rootDir: '/workspace/lsclaw',
        include: ['src/**/*.ts', 'README.md'],
        ignore: ['**/node_modules/**'],
      });
      expect(core.loadRuleFiles).toHaveBeenCalledWith(['rules/projects/lsclaw/**/*.yml']);
      expect(core.scan).toHaveBeenCalledWith(expect.objectContaining({
        project: 'lsclaw',
        rootDir: '/workspace/lsclaw',
        deterministic: true,
      }));
    });

    it('should return empty stats when no resolvable project workspace exists', async () => {
      const stats = await getCodeStats('custom');

      expect(stats).toEqual({
        total_files: 0,
        total_lines: 0,
        by_language: {},
        by_severity: {},
      });
      expect(adapters.getProjectAdapter).not.toHaveBeenCalled();
    });
  });
});
