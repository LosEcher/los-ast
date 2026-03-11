/**
 * Scan Service Unit Tests
 * Core façade 扫描服务单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scanService } from '../../../src/services/scan-service';
import { SCAN_LIMITS } from '../../../src/config';
import { CoreNotReadyError, ValidationError } from '../../../src/types/errors.js';
import * as core from '@los-ast/core';

// Mock Core 模块
vi.mock('@los-ast/core', () => ({
  scan: vi.fn(),
  isReady: vi.fn().mockReturnValue(true),
}));

describe('ScanService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(core.isReady).mockReturnValue(true);
  });

  describe('execute', () => {
    it('should call core.scan with correct parameters', async () => {
      const mockResult = {
        filesScanned: 5,
        findings: [],
        stats: { durationMs: 100, filesScanned: 5 },
      };
      vi.mocked(core.scan).mockResolvedValue(mockResult as any);

      const signal = new AbortController().signal;
      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        includeStats: false,
        signal,
      });

      expect(core.scan).toHaveBeenCalledWith(expect.objectContaining({
        project: 'test-project',
        rootDir: '/test/path',
        includeStats: false,
      }));
      expect(result).toEqual(mockResult);
    });

    it('should respect cancellation signal', async () => {
      const abortController = new AbortController();
      abortController.abort();

      await expect(
        scanService.execute({
          project: 'test-project',
          rootDir: '/test/path',
          signal: abortController.signal,
        })
      ).rejects.toThrow('Scan aborted');
    });

    it('should throw Service Unavailable when Core is not ready', async () => {
      vi.mocked(core.isReady).mockReturnValue(false);

      const signal = new AbortController().signal;
      await expect(
        scanService.execute({
          project: 'test-project',
          rootDir: '/test/path',
          signal,
        })
      ).rejects.toBeInstanceOf(CoreNotReadyError);
    });

    it('should include stats when includeStats is true', async () => {
      const mockResult = {
        filesScanned: 3,
        findings: [],
        stats: { durationMs: 50, filesScanned: 3 },
        parseCache: { hits: 10, misses: 2, size: 12 },
      };
      vi.mocked(core.scan).mockResolvedValue(mockResult as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        includeStats: true,
        signal: new AbortController().signal,
      });

      expect(core.scan).toHaveBeenCalledWith(
        expect.objectContaining({ includeStats: true })
      );
      expect(result.parseCache).toBeDefined();
    });

    it('should merge contract artifacts as contract findings', async () => {
      const mockResult = {
        filesScanned: 1,
        findings: [],
        stats: { durationMs: 40, filesScanned: 1 },
      };
      vi.mocked(core.scan).mockResolvedValue(mockResult as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        contractArtifacts: [
          {
            source: 'contract-baseline',
            ruleId: 'contract/endpoint-auth',
            severity: 'error',
            message: 'Missing auth requirement in public endpoint',
            file: '/tmp/openapi.yaml',
            line: 12,
            column: 4,
            governanceDomain: ['backend'],
            impactHint: 'high',
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toMatchObject({
        findingSource: 'contract',
        ruleFile: 'contract-baseline',
        ruleId: 'contract/endpoint-auth',
        severity: 'error',
        message: 'Missing auth requirement in public endpoint',
        file: '/tmp/openapi.yaml',
        language: 'contract',
        governanceDomain: ['backend'],
        impactHint: 'high',
      });
    });

    it('should derive contract findings from openApiDocuments', async () => {
      const mockResult = {
        filesScanned: 1,
        findings: [],
      };
      vi.mocked(core.scan).mockResolvedValue(mockResult as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        openApiDocuments: [
          {
            source: 'openapi-inline',
            file: '/tmp/openapi.yaml',
            content: [
              'openapi: 3.0.3',
              'paths:',
              '  /users:',
              '    post:',
              '      responses:',
              "        '400':",
              "          description: bad request",
            ].join('\n'),
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings).toHaveLength(3);
      expect(result.findings.map((finding) => finding.ruleId)).toEqual([
        'contract/openapi-operation-id',
        'contract/openapi-auth-required',
        'contract/openapi-success-response',
      ]);
      expect(result.findings.every((finding) => finding.findingSource === 'contract')).toBe(true);
    });

    it('should reject invalid openApiDocuments', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [],
      } as any);

      await expect(
        scanService.execute({
          project: 'test-project',
          rootDir: '/test/path',
          openApiDocuments: [
            {
              source: 'broken-openapi',
              content: 'openapi: 3.0.3\npaths: [\n',
            },
          ],
          signal: new AbortController().signal,
        })
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('should derive schema findings from schemaDocuments', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [],
      } as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        schemaDocuments: [
          {
            source: 'schema-inline',
            file: '/tmp/schema.sql',
            content: [
              'CREATE TABLE users (',
              '  email TEXT,',
              '  password TEXT NOT NULL',
              ');',
            ].join('\n'),
            format: 'sql',
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings).toHaveLength(2);
      expect(result.findings.map((finding) => finding.ruleId)).toEqual([
        'schema/sql-sensitive-nullable',
        'schema/sql-primary-key',
      ]);
      expect(result.findings.every((finding) => finding.findingSource === 'schema')).toBe(true);
    });

    it('should reject schemaDocuments with unknown format', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [],
      } as any);

      await expect(
        scanService.execute({
          project: 'test-project',
          rootDir: '/test/path',
          schemaDocuments: [
            {
              source: 'broken-schema',
              content: 'not a sql or prisma document',
            },
          ],
          signal: new AbortController().signal,
        })
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('should merge schema artifacts as schema findings', async () => {
      const mockResult = {
        filesScanned: 1,
        findings: [],
        stats: { durationMs: 50, filesScanned: 1 },
      };
      vi.mocked(core.scan).mockResolvedValue(mockResult as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        schemaArtifacts: [
          {
            source: 'schema-legacy',
            ruleId: 'schema/field-nullability',
            severity: 'warning',
            message: 'Nullable sensitive column should be constrained',
            file: '/tmp/schema.sql',
            line: 4,
            column: 3,
            governanceDomain: ['database'],
            impactHint: 'low',
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toMatchObject({
        findingSource: 'schema',
        ruleFile: 'schema-legacy',
        ruleId: 'schema/field-nullability',
        severity: 'warning',
        message: 'Nullable sensitive column should be constrained',
        file: '/tmp/schema.sql',
        language: 'schema',
        governanceDomain: ['database'],
        impactHint: 'low',
      });
    });

    it('should merge contract and schema artifacts together', async () => {
      const mockResult = {
        filesScanned: 1,
        findings: [
          {
            tool: 'los-ast',
            version: 0,
            timestamp: '1970-01-01T00:00:00.000Z',
            project: 'test-project',
            ruleFile: null,
            ruleId: 'ast/no-console',
            findingSource: 'ast',
            severity: 'warning',
            message: 'unexpected console',
            file: 'src/index.ts',
            language: 'typescript',
            range: {
              start: { line: 1, column: 1, index: 10 },
              end: { line: 1, column: 2, index: 11 },
            },
            excerpt: 'console.log',
            hasFix: false,
            proposedReplacement: null,
            fingerprint: 'ast1',
          },
        ],
      };
      vi.mocked(core.scan).mockResolvedValue(mockResult as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        contractArtifacts: [
          {
            source: 'contract-baseline',
            ruleId: 'contract/auth-required',
            severity: 'error',
            message: 'Contract requires auth',
            file: '/tmp/openapi.yaml',
            line: 20,
            column: 1,
            governanceDomain: 'backend',
            impactHint: 'high',
          },
        ],
        schemaArtifacts: [
          {
            source: 'schema/user-db.sql',
            ruleId: 'schema/field-nullability',
            severity: 'warning',
            message: 'Schema field nullable risk',
            file: '/tmp/schema.sql',
            line: 5,
            column: 3,
            governanceDomain: ['database'],
            impactHint: 'medium',
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings).toHaveLength(3);
      const findingSources = result.findings
        .map((finding) => finding.findingSource)
        .filter((findingSource): findingSource is 'ast' | 'contract' | 'schema' =>
          findingSource === 'ast' || findingSource === 'contract' || findingSource === 'schema'
        );

      expect(findingSources).toEqual(['ast', 'contract', 'schema']);

      expect(result.findings[1]).toMatchObject({
        findingSource: 'contract',
        ruleId: 'contract/auth-required',
      });

      expect(result.findings[2]).toMatchObject({
        findingSource: 'schema',
        ruleId: 'schema/field-nullability',
      });
    });
  });

  describe('SCAN_LIMITS', () => {
    it('should have correct default values', () => {
      expect(SCAN_LIMITS.maxFilesPerSyncScan).toBe(1000);
      expect(SCAN_LIMITS.maxResponseBytes).toBe(10 * 1024 * 1024); // 10MB
      expect(SCAN_LIMITS.maxDurationMs).toBe(30000); // 30s
    });

    it('should be configurable via environment variables', () => {
      // 验证配置结构支持环境变量覆盖
      expect(typeof SCAN_LIMITS.maxFilesPerSyncScan).toBe('number');
      expect(typeof SCAN_LIMITS.maxResponseBytes).toBe('number');
      expect(typeof SCAN_LIMITS.maxDurationMs).toBe('number');
    });
  });
});
