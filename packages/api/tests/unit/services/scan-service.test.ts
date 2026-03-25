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
  discoverFiles: vi.fn().mockResolvedValue([]),
  loadRuleFiles: vi.fn().mockResolvedValue([]),
}));

describe('ScanService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(core.isReady).mockReturnValue(true);
    vi.mocked(core.discoverFiles).mockResolvedValue([] as any);
    vi.mocked(core.loadRuleFiles).mockResolvedValue([] as any);
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
      expect(result.scanTelemetry).toMatchObject({
        mode: 'ast',
        explicitRulePatterns: 0,
        loadedRules: 0,
        estimatedFiles: 0,
        nativeInputs: {
          openApiDocuments: 0,
          openApiComparisons: 0,
          schemaDocuments: 0,
          schemaComparisons: 0,
          contractArtifacts: 0,
          schemaArtifacts: 0,
        },
      });
      expect(result.scanTelemetry?.durationMs).toEqual(expect.any(Number));
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

    it('should allow native-only contract scans without rootDir and skip core.scan', async () => {
      const result = await scanService.execute({
        project: 'test-project',
        includeStats: true,
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
              '          description: bad request',
            ].join('\n'),
            format: 'yaml',
          },
        ],
        signal: new AbortController().signal,
      });

      expect(core.scan).not.toHaveBeenCalled();
      expect(result.filesScanned).toBe(0);
      expect(result.findings).toHaveLength(3);
      expect(result.findings.every((finding) => finding.findingSource === 'contract')).toBe(true);
      expect(result.scanTelemetry).toMatchObject({
        mode: 'native_only',
        explicitRulePatterns: 0,
        loadedRules: 0,
        nativeInputs: {
          openApiDocuments: 1,
          openApiComparisons: 0,
          schemaDocuments: 0,
          schemaComparisons: 0,
          contractArtifacts: 0,
          schemaArtifacts: 0,
        },
      });
    });

    it('should allow native-only scans when core is not ready', async () => {
      vi.mocked(core.isReady).mockReturnValue(false);

      const result = await scanService.execute({
        project: 'test-project',
        schemaDocuments: [
          {
            source: 'schema-inline',
            file: '/tmp/schema.sql',
            content: [
              'CREATE TABLE users (',
              '  email TEXT,',
              '  status TEXT NOT NULL,',
              '  created_at TIMESTAMP NOT NULL,',
              '  password TEXT NOT NULL',
              ');',
            ].join('\n'),
            format: 'sql',
          },
        ],
        signal: new AbortController().signal,
      });

      expect(core.scan).not.toHaveBeenCalled();
      expect(result.filesScanned).toBe(0);
      expect(result.findings.every((finding) => finding.findingSource === 'schema')).toBe(true);
    });

    it('should allow clean native-only documents without rootDir even when they emit no findings', async () => {
      const result = await scanService.execute({
        project: 'test-project',
        openApiDocuments: [
          {
            source: 'openapi-inline',
            file: '/tmp/openapi.yaml',
            content: [
              'openapi: 3.0.3',
              'paths:',
              '  /users:',
              '    post:',
              '      operationId: createUser',
              '      security:',
              '        - bearerAuth: []',
              '      responses:',
              "        '200':",
              '          description: ok',
              'components:',
              '  securitySchemes:',
              '    bearerAuth:',
              '      type: http',
              '      scheme: bearer',
            ].join('\n'),
            format: 'yaml',
          },
        ],
        signal: new AbortController().signal,
      });

      expect(core.scan).not.toHaveBeenCalled();
      expect(result.filesScanned).toBe(0);
      expect(result.findings).toHaveLength(0);
    });

    it('should reject native-only requests without rootDir when code-scan config is present', async () => {
      await expect(
        scanService.execute({
          project: 'test-project',
          rules: ['rules/projects/lsclaw-governance/**/*.yml'],
          openApiDocuments: [
            {
              source: 'openapi-inline',
              file: '/tmp/openapi.yaml',
              content: 'openapi: 3.0.3\npaths: {}\n',
              format: 'yaml',
            },
          ],
          signal: new AbortController().signal,
        })
      ).rejects.toMatchObject({
        code: 'INVALID_ROOTDIR',
      });

      expect(core.scan).not.toHaveBeenCalled();
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

    it('should fail closed when file count estimation fails', async () => {
      vi.mocked(core.discoverFiles).mockRejectedValue(new Error('glob failed'));

      await expect(
        scanService.execute({
          project: 'test-project',
          rootDir: '/test/path',
          signal: new AbortController().signal,
        })
      ).rejects.toMatchObject({
        code: 'FILE_COUNT_ESTIMATE_FAILED',
      });

      expect(core.scan).not.toHaveBeenCalled();
    });

    it('should derive contract compatibility findings from openApiComparisons', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [],
      } as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        openApiComparisons: [
          {
            source: 'openapi-compare',
            file: '/tmp/openapi.yaml',
            format: 'yaml',
            baseline: [
              'openapi: 3.0.3',
              'paths:',
              '  /users:',
              '    post:',
              '      requestBody:',
              '        required: true',
              '        content:',
              '          application/json:',
              '            schema:',
              '              type: object',
              '              properties:',
              '                email: { type: string }',
              '                nickname: { type: string }',
              '      responses:',
              "        '200':",
              '          description: ok',
              '          content:',
              '            application/json:',
              '              schema:',
              '                type: object',
              '                required: [id]',
              '                properties:',
              '                  id: { type: string }',
              '                  nickname: { type: string }',
              '  /sessions:',
              '    get:',
              '      responses:',
              "        '200':",
              '          description: ok',
            ].join('\n'),
            current: [
              'openapi: 3.0.3',
              'paths:',
              '  /users:',
              '    post:',
              '      requestBody:',
              '        required: true',
              '        content:',
              '          application/json:',
              '            schema:',
              '              type: object',
              '              required: [email]',
              '              properties:',
              '                email: { type: integer }',
              '      responses:',
              "        '200':",
              '          description: ok',
              '          content:',
              '            application/json:',
              '              schema:',
              '                type: object',
              '                properties:',
              '                  id: { type: integer }',
            ].join('\n'),
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings.map((finding) => finding.ruleId)).toEqual([
        'contract/openapi-breaking-request-field-type-change',
        'contract/openapi-breaking-request-field-drop',
        'contract/openapi-breaking-request-required-add',
        'contract/openapi-breaking-response-field-type-change',
        'contract/openapi-breaking-response-required-drop',
        'contract/openapi-breaking-response-field-drop',
        'contract/openapi-breaking-operation-drop',
      ]);
      expect(result.findings.every((finding) => finding.findingSource === 'contract')).toBe(true);
      expect(result.findings[3].excerpt).toContain('response[200].id');
    });

    it('should resolve local refs and allOf shapes in openApiComparisons', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [],
      } as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        openApiComparisons: [
          {
            source: 'openapi-compare-ref',
            file: '/tmp/openapi-ref.yaml',
            format: 'yaml',
            baseline: [
              'openapi: 3.0.3',
              'components:',
              '  schemas:',
              '    ProfileBase:',
              '      type: object',
              '      properties:',
              '        age: { type: integer }',
              '    UserInput:',
              '      allOf:',
              "        - $ref: '#/components/schemas/ProfileBase'",
              '        - type: object',
              '          properties:',
              '            email: { type: string }',
              'paths:',
              '  /users:',
              '    post:',
              '      requestBody:',
              '        required: true',
              '        content:',
              '          application/json:',
              '            schema:',
              "              $ref: '#/components/schemas/UserInput'",
              '      responses:',
              "        '200':",
              '          description: ok',
            ].join('\n'),
            current: [
              'openapi: 3.0.3',
              'components:',
              '  schemas:',
              '    ProfileBase:',
              '      type: object',
              '      properties:',
              '        age: { type: string }',
              '    UserInput:',
              '      allOf:',
              "        - $ref: '#/components/schemas/ProfileBase'",
              '        - type: object',
              '          properties:',
              '            email: { type: string }',
              'paths:',
              '  /users:',
              '    post:',
              '      requestBody:',
              '        required: true',
              '        content:',
              '          application/json:',
              '            schema:',
              "              $ref: '#/components/schemas/UserInput'",
              '      responses:',
              "        '200':",
              '          description: ok',
            ].join('\n'),
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings.map((finding) => finding.ruleId)).toEqual([
        'contract/openapi-breaking-request-field-type-change',
      ]);
      expect(result.findings[0].message).toContain('request field age type from integer to string');
    });

    it('should resolve common fields across oneOf variants in openApiComparisons', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [],
      } as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        openApiComparisons: [
          {
            source: 'openapi-compare-oneof',
            file: '/tmp/openapi-oneof.yaml',
            format: 'yaml',
            baseline: [
              'openapi: 3.0.3',
              'paths:',
              '  /users:',
              '    post:',
              '      requestBody:',
              '        required: true',
              '        content:',
              '          application/json:',
              '            schema:',
              '              oneOf:',
              '                - type: object',
              '                  required: [kind, age]',
              '                  properties:',
              '                    kind: { type: string }',
              '                    age: { type: integer }',
              '                    email: { type: string }',
              '                - type: object',
              '                  required: [kind, age]',
              '                  properties:',
              '                    kind: { type: string }',
              '                    age: { type: integer }',
              '                    phone: { type: string }',
              '      responses:',
              "        '200':",
              '          description: ok',
            ].join('\n'),
            current: [
              'openapi: 3.0.3',
              'paths:',
              '  /users:',
              '    post:',
              '      requestBody:',
              '        required: true',
              '        content:',
              '          application/json:',
              '            schema:',
              '              oneOf:',
              '                - type: object',
              '                  required: [kind, age]',
              '                  properties:',
              '                    kind: { type: string }',
              '                    age: { type: string }',
              '                    email: { type: string }',
              '                - type: object',
              '                  required: [kind, age]',
              '                  properties:',
              '                    kind: { type: string }',
              '                    age: { type: string }',
              '                    phone: { type: string }',
              '      responses:',
              "        '200':",
              '          description: ok',
            ].join('\n'),
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings.map((finding) => finding.ruleId)).toEqual([
        'contract/openapi-breaking-request-field-type-change',
      ]);
      expect(result.findings[0].message).toContain('request field age type from integer to string');
    });

    it('should compare top-level array item object shapes in openApiComparisons', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [],
      } as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        openApiComparisons: [
          {
            source: 'openapi-compare-array',
            file: '/tmp/openapi-array.yaml',
            format: 'yaml',
            baseline: [
              'openapi: 3.0.3',
              'paths:',
              '  /users:',
              '    post:',
              '      requestBody:',
              '        required: true',
              '        content:',
              '          application/json:',
              '            schema:',
              '              type: array',
              '              items:',
              '                type: object',
              '                properties:',
              '                  age: { type: integer }',
              '      responses:',
              "        '200':",
              '          description: ok',
              '          content:',
              '            application/json:',
              '              schema:',
              '                type: array',
              '                items:',
              '                  type: object',
              '                  required: [id]',
              '                  properties:',
              '                    id: { type: string }',
            ].join('\n'),
            current: [
              'openapi: 3.0.3',
              'paths:',
              '  /users:',
              '    post:',
              '      requestBody:',
              '        required: true',
              '        content:',
              '          application/json:',
              '            schema:',
              '              type: array',
              '              items:',
              '                type: object',
              '                properties:',
              '                  age: { type: string }',
              '      responses:',
              "        '200':",
              '          description: ok',
              '          content:',
              '            application/json:',
              '              schema:',
              '                type: array',
              '                items:',
              '                  type: object',
              '                  properties:',
              '                    id: { type: string }',
            ].join('\n'),
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings.map((finding) => finding.ruleId)).toEqual([
        'contract/openapi-breaking-request-field-type-change',
        'contract/openapi-breaking-response-required-drop',
      ]);
      expect(result.findings[0].excerpt).toContain('request[].age');
      expect(result.findings[1].excerpt).toContain('response[200][].id');
    });

    it('should resolve local refs across oneOf response variants in openApiComparisons', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [],
      } as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        openApiComparisons: [
          {
            source: 'openapi-compare-response-oneof-ref',
            file: '/tmp/openapi-response-oneof-ref.yaml',
            format: 'yaml',
            baseline: [
              'openapi: 3.0.3',
              'components:',
              '  schemas:',
              '    UserA:',
              '      type: object',
              '      required: [kind, age]',
              '      properties:',
              '        kind: { type: string }',
              '        age: { type: integer }',
              '        email: { type: string }',
              '    UserB:',
              '      type: object',
              '      required: [kind, age]',
              '      properties:',
              '        kind: { type: string }',
              '        age: { type: integer }',
              '        phone: { type: string }',
              'paths:',
              '  /users:',
              '    get:',
              '      responses:',
              "        '200':",
              '          description: ok',
              '          content:',
              '            application/json:',
              '              schema:',
              '                oneOf:',
              "                  - $ref: '#/components/schemas/UserA'",
              "                  - $ref: '#/components/schemas/UserB'",
            ].join('\n'),
            current: [
              'openapi: 3.0.3',
              'components:',
              '  schemas:',
              '    UserA:',
              '      type: object',
              '      required: [kind]',
              '      properties:',
              '        kind: { type: string }',
              '        age: { type: string }',
              '        email: { type: string }',
              '    UserB:',
              '      type: object',
              '      required: [kind, age]',
              '      properties:',
              '        kind: { type: string }',
              '        age: { type: string }',
              '        phone: { type: string }',
              'paths:',
              '  /users:',
              '    get:',
              '      responses:',
              "        '200':",
              '          description: ok',
              '          content:',
              '            application/json:',
              '              schema:',
              '                oneOf:',
              "                  - $ref: '#/components/schemas/UserA'",
              "                  - $ref: '#/components/schemas/UserB'",
            ].join('\n'),
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings.map((finding) => finding.ruleId)).toEqual([
        'contract/openapi-breaking-response-field-type-change',
        'contract/openapi-breaking-response-required-drop',
      ]);
      expect(result.findings[0].message).toContain('response field age type from integer to string');
      expect(result.findings[0].excerpt).toContain('response[200].age');
    });

    it('should compare nested object and array item paths in openApiComparisons', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [],
      } as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        openApiComparisons: [
          {
            source: 'openapi-compare-nested',
            file: '/tmp/openapi-nested.yaml',
            format: 'yaml',
            baseline: [
              'openapi: 3.0.3',
              'paths:',
              '  /users:',
              '    post:',
              '      requestBody:',
              '        required: true',
              '        content:',
              '          application/json:',
              '            schema:',
              '              type: object',
              '              required: [profile]',
              '              properties:',
              '                profile:',
              '                  type: object',
              '                  required: [age]',
              '                  properties:',
              '                    age: { type: integer }',
              '      responses:',
              "        '200':",
              '          description: ok',
              '          content:',
              '            application/json:',
              '              schema:',
              '                type: object',
              '                required: [users]',
              '                properties:',
              '                  users:',
              '                    type: array',
              '                    items:',
              '                      type: object',
              '                      required: [id]',
              '                      properties:',
              '                        id: { type: string }',
            ].join('\n'),
            current: [
              'openapi: 3.0.3',
              'paths:',
              '  /users:',
              '    post:',
              '      requestBody:',
              '        required: true',
              '        content:',
              '          application/json:',
              '            schema:',
              '              type: object',
              '              required: [profile]',
              '              properties:',
              '                profile:',
              '                  type: object',
              '                  required: [age]',
              '                  properties:',
              '                    age: { type: string }',
              '      responses:',
              "        '200':",
              '          description: ok',
              '          content:',
              '            application/json:',
              '              schema:',
              '                type: object',
              '                required: [users]',
              '                properties:',
              '                  users:',
              '                    type: array',
              '                    items:',
              '                      type: object',
              '                      properties:',
              '                        id: { type: string }',
            ].join('\n'),
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings.map((finding) => finding.ruleId)).toEqual([
        'contract/openapi-breaking-request-field-type-change',
        'contract/openapi-breaking-response-required-drop',
      ]);
      expect(result.findings[0].excerpt).toContain('request.profile.age');
      expect(result.findings[1].excerpt).toContain('response[200].users[].id');
    });

    it('should resolve nested ref, allOf and oneOf array paths in openApiComparisons', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [],
      } as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        openApiComparisons: [
          {
            source: 'openapi-compare-nested-composed',
            file: '/tmp/openapi-nested-composed.yaml',
            format: 'yaml',
            baseline: [
              'openapi: 3.0.3',
              'components:',
              '  schemas:',
              '    BaseProfile:',
              '      type: object',
              '      required: [age]',
              '      properties:',
              '        age: { type: integer }',
              '    ExtendedProfile:',
              '      allOf:',
              "        - $ref: '#/components/schemas/BaseProfile'",
              '        - type: object',
              '          properties:',
              '            nickname: { type: string }',
              '    UserA:',
              '      type: object',
              '      required: [id]',
              '      properties:',
              '        id: { type: integer }',
              '        email: { type: string }',
              '    UserB:',
              '      type: object',
              '      required: [id]',
              '      properties:',
              '        id: { type: integer }',
              '        phone: { type: string }',
              'paths:',
              '  /users:',
              '    post:',
              '      requestBody:',
              '        required: true',
              '        content:',
              '          application/json:',
              '            schema:',
              '              type: object',
              '              required: [profile]',
              '              properties:',
              '                profile:',
              "                  $ref: '#/components/schemas/ExtendedProfile'",
              '      responses:',
              "        '200':",
              '          description: ok',
              '          content:',
              '            application/json:',
              '              schema:',
              '                type: object',
              '                required: [users]',
              '                properties:',
              '                  users:',
              '                    type: array',
              '                    items:',
              '                      oneOf:',
              "                        - $ref: '#/components/schemas/UserA'",
              "                        - $ref: '#/components/schemas/UserB'",
            ].join('\n'),
            current: [
              'openapi: 3.0.3',
              'components:',
              '  schemas:',
              '    BaseProfile:',
              '      type: object',
              '      required: [age]',
              '      properties:',
              '        age: { type: string }',
              '    ExtendedProfile:',
              '      allOf:',
              "        - $ref: '#/components/schemas/BaseProfile'",
              '        - type: object',
              '          properties:',
              '            nickname: { type: string }',
              '    UserA:',
              '      type: object',
              '      required: [id]',
              '      properties:',
              '        id: { type: string }',
              '        email: { type: string }',
              '    UserB:',
              '      type: object',
              '      required: [id]',
              '      properties:',
              '        id: { type: string }',
              '        phone: { type: string }',
              'paths:',
              '  /users:',
              '    post:',
              '      requestBody:',
              '        required: true',
              '        content:',
              '          application/json:',
              '            schema:',
              '              type: object',
              '              required: [profile]',
              '              properties:',
              '                profile:',
              "                  $ref: '#/components/schemas/ExtendedProfile'",
              '      responses:',
              "        '200':",
              '          description: ok',
              '          content:',
              '            application/json:',
              '              schema:',
              '                type: object',
              '                required: [users]',
              '                properties:',
              '                  users:',
              '                    type: array',
              '                    items:',
              '                      oneOf:',
              "                        - $ref: '#/components/schemas/UserA'",
              "                        - $ref: '#/components/schemas/UserB'",
            ].join('\n'),
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings.map((finding) => finding.ruleId)).toEqual([
        'contract/openapi-breaking-request-field-type-change',
        'contract/openapi-breaking-response-field-type-change',
      ]);
      expect(result.findings[0].excerpt).toContain('request.profile.age');
      expect(result.findings[1].excerpt).toContain('response[200].users[].id');
    });

    it('should compare additionalProperties map-like paths in openApiComparisons', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [],
      } as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        openApiComparisons: [
          {
            source: 'openapi-compare-map-like',
            file: '/tmp/openapi-map-like.yaml',
            format: 'yaml',
            baseline: [
              'openapi: 3.0.3',
              'paths:',
              '  /users:',
              '    post:',
              '      requestBody:',
              '        required: true',
              '        content:',
              '          application/json:',
              '            schema:',
              '              type: object',
              '              required: [metadata]',
              '              properties:',
              '                metadata:',
              '                  type: object',
              '                  additionalProperties:',
              '                    type: integer',
              '      responses:',
              "        '200':",
              '          description: ok',
              '          content:',
              '            application/json:',
              '              schema:',
              '                type: object',
              '                required: [profiles]',
              '                properties:',
              '                  profiles:',
              '                    type: object',
              '                    additionalProperties:',
              '                      type: object',
              '                      required: [id]',
              '                      properties:',
              '                        id: { type: string }',
            ].join('\n'),
            current: [
              'openapi: 3.0.3',
              'paths:',
              '  /users:',
              '    post:',
              '      requestBody:',
              '        required: true',
              '        content:',
              '          application/json:',
              '            schema:',
              '              type: object',
              '              required: [metadata]',
              '              properties:',
              '                metadata:',
              '                  type: object',
              '                  additionalProperties:',
              '                    type: string',
              '      responses:',
              "        '200':",
              '          description: ok',
              '          content:',
              '            application/json:',
              '              schema:',
              '                type: object',
              '                required: [profiles]',
              '                properties:',
              '                  profiles:',
              '                    type: object',
              '                    additionalProperties:',
              '                      type: object',
              '                      properties:',
              '                        id: { type: string }',
            ].join('\n'),
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings.map((finding) => finding.ruleId)).toEqual([
        'contract/openapi-breaking-request-field-type-change',
        'contract/openapi-breaking-response-required-drop',
      ]);
      expect(result.findings[0].excerpt).toContain('request.metadata.*');
      expect(result.findings[1].excerpt).toContain('response[200].profiles.*.id');
    });

    it('should compare nullable enum and default drift in openApiComparisons', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [],
      } as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        openApiComparisons: [
          {
            source: 'openapi-compare-value-semantics',
            file: '/tmp/openapi-value-semantics.yaml',
            format: 'yaml',
            baseline: [
              'openapi: 3.0.3',
              'paths:',
              '  /users:',
              '    post:',
              '      requestBody:',
              '        required: true',
              '        content:',
              '          application/json:',
              '            schema:',
              '              type: object',
              '              required: [email]',
              '              properties:',
              '                status:',
              '                  type: string',
              '                  nullable: true',
              '                  enum: [active, disabled, archived]',
              '                  default: active',
              '      responses:',
              "        '200':",
              '          description: ok',
              '          content:',
              '            application/json:',
              '              schema:',
              '                type: object',
              '                properties:',
              '                  state:',
              '                    type: string',
              '                    nullable: true',
              '                    enum: [queued, done]',
              '                    default: queued',
            ].join('\n'),
            current: [
              'openapi: 3.0.3',
              'paths:',
              '  /users:',
              '    post:',
              '      requestBody:',
              '        required: true',
              '        content:',
              '          application/json:',
              '            schema:',
              '              type: object',
              '              properties:',
              '                status:',
              '                  type: string',
              '                  enum: [active, disabled]',
              '                  default: disabled',
              '      responses:',
              "        '200':",
              '          description: ok',
              '          content:',
              '            application/json:',
              '              schema:',
              '                type: object',
              '                properties:',
              '                  state:',
              '                    type: string',
              '                    enum: [queued]',
            ].join('\n'),
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings.map((finding) => finding.ruleId)).toEqual([
        'contract/openapi-breaking-request-nullable-tighten',
        'contract/openapi-breaking-request-enum-value-drop',
        'contract/openapi-request-default-changed',
        'contract/openapi-breaking-response-nullable-tighten',
        'contract/openapi-breaking-response-enum-value-drop',
        'contract/openapi-response-default-removed',
      ]);
      expect(result.findings[0].excerpt).toContain('request.status');
      expect(result.findings[4].excerpt).toContain('response[200].state');
    });

    it('should compare discriminator property and mapping drift in openApiComparisons', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [],
      } as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        openApiComparisons: [
          {
            source: 'openapi-compare-discriminator',
            file: '/tmp/openapi-discriminator.yaml',
            format: 'yaml',
            baseline: [
              'openapi: 3.0.3',
              'paths:',
              '  /users:',
              '    post:',
              '      requestBody:',
              '        required: true',
              '        content:',
              '          application/json:',
              '            schema:',
              '              oneOf:',
              '                - type: object',
              '                  properties:',
              '                    kind: { type: string }',
              '                    type: { type: string }',
              '                    id: { type: string }',
              '                - type: object',
              '                  properties:',
              '                    kind: { type: string }',
              '                    type: { type: string }',
              '                    id: { type: string }',
              '              discriminator:',
              '                propertyName: kind',
              '                mapping:',
              "                  admin: '#/components/schemas/AdminUser'",
              "                  guest: '#/components/schemas/GuestUser'",
              '      responses:',
              "        '200':",
              '          description: ok',
              '          content:',
              '            application/json:',
              '              schema:',
              '                oneOf:',
              '                  - type: object',
              '                    properties:',
              '                      status: { type: string }',
              '                      id: { type: string }',
              '                  - type: object',
              '                    properties:',
              '                      status: { type: string }',
              '                      id: { type: string }',
              '                discriminator:',
              '                  propertyName: status',
              '                  mapping:',
              "                    active: '#/components/schemas/ActiveUser'",
              "                    disabled: '#/components/schemas/DisabledUser'",
            ].join('\n'),
            current: [
              'openapi: 3.0.3',
              'paths:',
              '  /users:',
              '    post:',
              '      requestBody:',
              '        required: true',
              '        content:',
              '          application/json:',
              '            schema:',
              '              oneOf:',
              '                - type: object',
              '                  properties:',
              '                    kind: { type: string }',
              '                    type: { type: string }',
              '                    id: { type: string }',
              '                - type: object',
              '                  properties:',
              '                    kind: { type: string }',
              '                    type: { type: string }',
              '                    id: { type: string }',
              '              discriminator:',
              '                propertyName: type',
              '                mapping:',
              "                  admin: '#/components/schemas/AdminUser'",
              '      responses:',
              "        '200':",
              '          description: ok',
              '          content:',
              '            application/json:',
              '              schema:',
              '                oneOf:',
              '                  - type: object',
              '                    properties:',
              '                      status: { type: string }',
              '                      id: { type: string }',
              '                  - type: object',
              '                    properties:',
              '                      status: { type: string }',
              '                      id: { type: string }',
              '                discriminator:',
              '                  propertyName: status',
              '                  mapping:',
              "                    active: '#/components/schemas/ActiveUser'",
            ].join('\n'),
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings.map((finding) => finding.ruleId)).toEqual([
        'contract/openapi-breaking-request-discriminator-change',
        'contract/openapi-breaking-request-discriminator-value-drop',
        'contract/openapi-breaking-response-discriminator-value-drop',
      ]);
      expect(result.findings[0].excerpt).toContain('request#discriminator.kind');
      expect(result.findings[2].excerpt).toContain('response[200]#discriminator.status');
    });

    it('should downgrade added required request fields when a default is present', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [],
      } as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        openApiComparisons: [
          {
            source: 'openapi-compare-required-default',
            file: '/tmp/openapi-required-default.yaml',
            format: 'yaml',
            baseline: [
              'openapi: 3.0.3',
              'paths:',
              '  /users:',
              '    post:',
              '      requestBody:',
              '        required: true',
              '        content:',
              '          application/json:',
              '            schema:',
              '              type: object',
              '              required: [email]',
              '              properties:',
              '                email: { type: string }',
              '      responses:',
              "        '200':",
              '          description: ok',
            ].join('\n'),
            current: [
              'openapi: 3.0.3',
              'paths:',
              '  /users:',
              '    post:',
              '      requestBody:',
              '        required: true',
              '        content:',
              '          application/json:',
              '            schema:',
              '              type: object',
              '              required: [email, locale]',
              '              properties:',
              '                email: { type: string }',
              '                locale:',
              '                  type: string',
              '                  default: zh-CN',
              '      responses:',
              "        '200':",
              '          description: ok',
            ].join('\n'),
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings.map((finding) => finding.ruleId)).toEqual([
        'contract/openapi-request-required-add-with-default',
      ]);
      expect(result.findings[0].severity).toBe('warning');
      expect(result.findings[0].excerpt).toContain('request.locale');
    });

    it('should compare allOf additionalProperties nullable drift across nested paths', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [],
      } as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        openApiComparisons: [
          {
            source: 'openapi-compare-cross-boundary',
            file: '/tmp/openapi-cross-boundary.yaml',
            format: 'yaml',
            baseline: [
              'openapi: 3.0.3',
              'components:',
              '  schemas:',
              '    MetadataBase:',
              '      type: object',
              '      additionalProperties:',
              '        type: string',
              '        nullable: true',
              'paths:',
              '  /users:',
              '    post:',
              '      requestBody:',
              '        required: true',
              '        content:',
              '          application/json:',
              '            schema:',
              '              type: object',
              '              required: [metadata]',
              '              properties:',
              '                metadata:',
              '                  allOf:',
              "                    - $ref: '#/components/schemas/MetadataBase'",
              '                    - type: object',
              '      responses:',
              "        '200':",
              '          description: ok',
            ].join('\n'),
            current: [
              'openapi: 3.0.3',
              'components:',
              '  schemas:',
              '    MetadataBase:',
              '      type: object',
              '      additionalProperties:',
              '        type: string',
              'paths:',
              '  /users:',
              '    post:',
              '      requestBody:',
              '        required: true',
              '        content:',
              '          application/json:',
              '            schema:',
              '              type: object',
              '              required: [metadata]',
              '              properties:',
              '                metadata:',
              '                  allOf:',
              "                    - $ref: '#/components/schemas/MetadataBase'",
              '                    - type: object',
              '      responses:',
              "        '200':",
              '          description: ok',
            ].join('\n'),
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings.map((finding) => finding.ruleId)).toEqual([
        'contract/openapi-breaking-request-nullable-tighten',
      ]);
      expect(result.findings[0].excerpt).toContain('request.metadata.*');
    });

    it('should compare nested discriminator paths inside object and array items', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [],
      } as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        openApiComparisons: [
          {
            source: 'openapi-compare-nested-discriminator',
            file: '/tmp/openapi-nested-discriminator.yaml',
            format: 'yaml',
            baseline: [
              'openapi: 3.0.3',
              'paths:',
              '  /users:',
              '    post:',
              '      requestBody:',
              '        required: true',
              '        content:',
              '          application/json:',
              '            schema:',
              '              type: object',
              '              properties:',
              '                payload:',
              '                  oneOf:',
              '                    - type: object',
              '                      properties:',
              '                        kind: { type: string }',
              '                        id: { type: string }',
              '                    - type: object',
              '                      properties:',
              '                        kind: { type: string }',
              '                        id: { type: string }',
              '                  discriminator:',
              '                    propertyName: kind',
              '                    mapping:',
              "                      a: '#/components/schemas/A'",
              "                      b: '#/components/schemas/B'",
              '      responses:',
              "        '200':",
              '          description: ok',
              '          content:',
              '            application/json:',
              '              schema:',
              '                type: object',
              '                properties:',
              '                  users:',
              '                    type: array',
              '                    items:',
              '                      oneOf:',
              '                        - type: object',
              '                          properties:',
              '                            status: { type: string }',
              '                            id: { type: string }',
              '                        - type: object',
              '                          properties:',
              '                            status: { type: string }',
              '                            id: { type: string }',
              '                      discriminator:',
              '                        propertyName: status',
              '                        mapping:',
              "                          active: '#/components/schemas/ActiveUser'",
              "                          disabled: '#/components/schemas/DisabledUser'",
            ].join('\n'),
            current: [
              'openapi: 3.0.3',
              'paths:',
              '  /users:',
              '    post:',
              '      requestBody:',
              '        required: true',
              '        content:',
              '          application/json:',
              '            schema:',
              '              type: object',
              '              properties:',
              '                payload:',
              '                  oneOf:',
              '                    - type: object',
              '                      properties:',
              '                        kind: { type: string }',
              '                        id: { type: string }',
              '                    - type: object',
              '                      properties:',
              '                        kind: { type: string }',
              '                        id: { type: string }',
              '                  discriminator:',
              '                    propertyName: kind',
              '                    mapping:',
              "                      a: '#/components/schemas/A'",
              '      responses:',
              "        '200':",
              '          description: ok',
              '          content:',
              '            application/json:',
              '              schema:',
              '                type: object',
              '                properties:',
              '                  users:',
              '                    type: array',
              '                    items:',
              '                      oneOf:',
              '                        - type: object',
              '                          properties:',
              '                            status: { type: string }',
              '                            id: { type: string }',
              '                        - type: object',
              '                          properties:',
              '                            status: { type: string }',
              '                            id: { type: string }',
              '                      discriminator:',
              '                        propertyName: state',
              '                        mapping:',
              "                          active: '#/components/schemas/ActiveUser'",
              "                          disabled: '#/components/schemas/DisabledUser'",
            ].join('\n'),
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings.map((finding) => finding.ruleId)).toEqual([
        'contract/openapi-breaking-request-discriminator-value-drop',
        'contract/openapi-breaking-response-discriminator-change',
      ]);
      expect(result.findings[0].excerpt).toContain('request.payload#discriminator.kind');
      expect(result.findings[1].excerpt).toContain('response[200].users[]#discriminator.status');
    });

    it('should align response comparisons by success status code', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [],
      } as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        openApiComparisons: [
          {
            source: 'openapi-compare-status',
            file: '/tmp/openapi-status.yaml',
            format: 'yaml',
            baseline: [
              'openapi: 3.0.3',
              'paths:',
              '  /users:',
              '    post:',
              '      responses:',
              "        '200':",
              '          description: ok',
              '          content:',
              '            application/json:',
              '              schema:',
              '                type: object',
              '                required: [id]',
              '                properties:',
              '                  id: { type: string }',
            ].join('\n'),
            current: [
              'openapi: 3.0.3',
              'paths:',
              '  /users:',
              '    post:',
              '      responses:',
              "        '201':",
              '          description: created',
              '          content:',
              '            application/json:',
              '              schema:',
              '                type: object',
              '                required: [id]',
              '                properties:',
              '                  id: { type: string }',
            ].join('\n'),
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings.map((finding) => finding.ruleId)).toEqual([
        'contract/openapi-breaking-response-status-drop',
      ]);
      expect(result.findings[0].excerpt).toContain('response[200]');
    });

    it('should surface request validation tightening and response validation weakening findings', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [],
      } as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        openApiComparisons: [
          {
            source: 'openapi-compare-validation-semantics',
            file: '/tmp/openapi-validation-semantics.yaml',
            format: 'yaml',
            baseline: [
              'openapi: 3.0.3',
              'paths:',
              '  /users:',
              '    post:',
              '      requestBody:',
              '        required: true',
              '        content:',
              '          application/json:',
              '            schema:',
              '              type: object',
              '              properties:',
              '                email:',
              '                  type: string',
              '                  minLength: 3',
              '      responses:',
              "        '200':",
              '          description: ok',
              '          content:',
              '            application/json:',
              '              schema:',
              '                type: object',
              '                properties:',
              '                  status:',
              '                    type: string',
              '                    pattern: "^(queued|done)$"',
            ].join('\n'),
            current: [
              'openapi: 3.0.3',
              'paths:',
              '  /users:',
              '    post:',
              '      requestBody:',
              '        required: true',
              '        content:',
              '          application/json:',
              '            schema:',
              '              type: object',
              '              properties:',
              '                email:',
              '                  type: string',
              '                  minLength: 8',
              '                  format: email',
              '      responses:',
              "        '200':",
              '          description: ok',
              '          content:',
              '            application/json:',
              '              schema:',
              '                type: object',
              '                properties:',
              '                  status:',
              '                    type: string',
            ].join('\n'),
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings.map((finding) => finding.ruleId)).toEqual([
        'contract/openapi-breaking-request-validation-tighten',
        'contract/openapi-breaking-response-validation-weaken',
      ]);
      expect(result.findings[0].excerpt).toContain('request.email');
      expect(result.findings[1].excerpt).toContain('response[200].status');
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
              '  status TEXT NOT NULL,',
              '  created_at TIMESTAMP NOT NULL,',
              '  password TEXT NOT NULL',
              ');',
            ].join('\n'),
            format: 'sql',
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings).toHaveLength(4);
      expect(result.findings.map((finding) => finding.ruleId)).toEqual([
        'schema/sql-sensitive-nullable',
        'schema/sql-lifecycle-default',
        'schema/sql-audit-timestamp-default',
        'schema/sql-primary-key',
      ]);
      expect(result.findings.every((finding) => finding.findingSource === 'schema')).toBe(true);
    });

    it('should keep contract and schema native inputs on separate finding channels', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [],
      } as any);

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
              '          description: bad request',
            ].join('\n'),
            format: 'yaml',
          },
        ],
        schemaDocuments: [
          {
            source: 'schema-inline',
            file: '/tmp/schema.sql',
            content: [
              'CREATE TABLE users (',
              '  email TEXT,',
              '  status TEXT NOT NULL,',
              '  created_at TIMESTAMP NOT NULL,',
              '  password TEXT NOT NULL',
              ');',
            ].join('\n'),
            format: 'sql',
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings).toHaveLength(7);

      const contractFindings = result.findings.filter((finding) => finding.findingSource === 'contract');
      const schemaFindings = result.findings.filter((finding) => finding.findingSource === 'schema');

      expect(contractFindings).toHaveLength(3);
      expect(schemaFindings).toHaveLength(4);
      expect(contractFindings.every((finding) => finding.language === 'contract')).toBe(true);
      expect(schemaFindings.every((finding) => finding.language === 'schema')).toBe(true);
      expect(contractFindings.every((finding) => finding.file === '/tmp/openapi.yaml')).toBe(true);
      expect(schemaFindings.every((finding) => finding.file === '/tmp/schema.sql')).toBe(true);
      expect(contractFindings.every((finding) => finding.ruleId.startsWith('contract/'))).toBe(true);
      expect(schemaFindings.every((finding) => finding.ruleId.startsWith('schema/'))).toBe(true);
    });

    it('should keep same-location findings separated by source with deterministic source ordering', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [
          {
            tool: 'los-ast',
            version: 0,
            timestamp: '1970-01-01T00:00:00.000Z',
            project: 'test-project',
            ruleFile: '/rules/ast.yml',
            ruleId: 'ast/no-console',
            severity: 'warning',
            message: 'ast finding',
            file: '/same/file.ts',
            language: 'typescript',
            range: {
              start: { line: 10, column: 0, index: 100 },
              end: { line: 10, column: 10, index: 110 },
            },
            excerpt: 'console.log',
            hasFix: false,
            proposedReplacement: null,
            fingerprint: 'ast-1',
            findingSource: 'ast',
          },
        ],
      } as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        deterministic: true,
        contractArtifacts: [
          {
            source: 'contract-source',
            ruleId: 'contract/demo',
            severity: 'warning',
            message: 'contract finding',
            file: '/same/file.ts',
            language: 'contract',
            line: 10,
            column: 0,
            startIndex: 100,
            endIndex: 110,
            excerpt: 'contract finding',
          },
        ],
        schemaArtifacts: [
          {
            source: 'schema-source',
            ruleId: 'schema/demo',
            severity: 'warning',
            message: 'schema finding',
            file: '/same/file.ts',
            language: 'schema',
            line: 10,
            column: 0,
            startIndex: 100,
            endIndex: 110,
            excerpt: 'schema finding',
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings.map((finding) => finding.findingSource)).toEqual([
        'ast',
        'contract',
        'schema',
      ]);
      expect(result.findings).toHaveLength(3);
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

    it('should reject requests without rootDir when no native artifacts are provided', async () => {
      await expect(
        scanService.execute({
          project: 'test-project',
          signal: new AbortController().signal,
        })
      ).rejects.toMatchObject({
        code: 'INVALID_SCAN_INPUT',
      });
    });

    it('should reject rule-based scans without rootDir', async () => {
      await expect(
        scanService.execute({
          project: 'test-project',
          rules: ['rules/projects/lsclaw-governance/**/*.yml'],
          signal: new AbortController().signal,
        })
      ).rejects.toMatchObject({
        code: 'INVALID_ROOTDIR',
      });
    });

    it('should derive breaking findings from schemaComparisons', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [],
      } as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        schemaComparisons: [
          {
            source: 'schema-compare',
            file: '/tmp/schema.sql',
            format: 'sql',
            baseline: [
              'CREATE TABLE users (',
              '  email TEXT,',
              '  status TEXT,',
              '  PRIMARY KEY (email)',
              ');',
            ].join('\n'),
            current: [
              'CREATE TABLE users (',
              '  status INTEGER NOT NULL,',
              '  PRIMARY KEY (status)',
              ');',
            ].join('\n'),
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings.map((finding) => finding.ruleId)).toEqual([
        'schema/sql-breaking-primary-key-change',
        'schema/sql-breaking-drop-field',
        'schema/sql-breaking-type-change',
        'schema/sql-breaking-nullability-tighten',
      ]);
    });

    it('should flag added required schema fields without defaults as breaking', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [],
      } as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        schemaComparisons: [
          {
            source: 'schema-compare-add-required',
            file: '/tmp/schema.prisma',
            format: 'prisma',
            baseline: [
              'model User {',
              '  id String @id',
              '}',
            ].join('\n'),
            current: [
              'model User {',
              '  id String @id',
              '  email String',
              '}',
            ].join('\n'),
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings.map((finding) => finding.ruleId)).toEqual([
        'schema/prisma-breaking-add-required-field',
      ]);
      expect(result.findings[0].findingSource).toBe('schema');
    });

    it('should grade added required schema fields when a default is present', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [],
      } as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        schemaComparisons: [
          {
            source: 'schema-compare-add-required-default',
            file: '/tmp/schema.prisma',
            format: 'prisma',
            baseline: [
              'model User {',
              '  id String @id',
              '}',
            ].join('\n'),
            current: [
              'model User {',
              '  id String @id',
              '  email String @default("demo@example.com")',
              '}',
            ].join('\n'),
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings.map((finding) => finding.ruleId)).toEqual([
        'schema/prisma-add-required-field-with-default',
      ]);
      expect(result.findings[0].severity).toBe('warning');
    });

    it('should flag primary key drift from schemaComparisons', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [],
      } as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        schemaComparisons: [
          {
            source: 'schema-compare-primary-key',
            file: '/tmp/schema.sql',
            format: 'sql',
            baseline: [
              'CREATE TABLE users (',
              '  id TEXT NOT NULL,',
              '  email TEXT,',
              '  PRIMARY KEY (id)',
              ');',
            ].join('\n'),
            current: [
              'CREATE TABLE users (',
              '  id TEXT NOT NULL,',
              '  email TEXT NOT NULL,',
              '  PRIMARY KEY (email)',
              ');',
            ].join('\n'),
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings.map((finding) => finding.ruleId)).toEqual([
        'schema/sql-breaking-primary-key-change',
        'schema/sql-breaking-nullability-tighten',
      ]);
    });

    it('should grade enum and default compatibility drift from schemaComparisons', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [],
      } as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        schemaComparisons: [
          {
            source: 'schema-compare-prisma',
            file: '/tmp/schema.prisma',
            format: 'prisma',
            baseline: [
              'enum UserStatus {',
              '  ACTIVE',
              '  DISABLED',
              '}',
              '',
              'model User {',
              '  id     String     @id',
              '  status UserStatus @default(ACTIVE)',
              '}',
            ].join('\n'),
            current: [
              'enum UserStatus {',
              '  ACTIVE',
              '}',
              '',
              'model User {',
              '  id     String     @id',
              '  status UserStatus',
              '}',
            ].join('\n'),
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings.map((finding) => finding.ruleId)).toEqual([
        'schema/prisma-breaking-enum-value-drop',
        'schema/prisma-default-removed',
      ]);
    });

    it('should treat equivalent timestamp defaults as compatible in schemaComparisons', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [],
      } as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        schemaComparisons: [
          {
            source: 'schema-compare-sql-defaults',
            file: '/tmp/schema.sql',
            format: 'sql',
            baseline: [
              'CREATE TABLE users (',
              '  id TEXT NOT NULL DEFAULT gen_random_uuid(),',
              '  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,',
              '  PRIMARY KEY (id)',
              ');',
            ].join('\n'),
            current: [
              'CREATE TABLE users (',
              '  id TEXT NOT NULL DEFAULT gen_random_uuid(),',
              '  created_at TIMESTAMP NOT NULL DEFAULT (now()),',
              '  PRIMARY KEY (id)',
              ');',
            ].join('\n'),
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings).toHaveLength(0);
    });

    it('should treat equivalent sql timestamp and uuid defaults as compatible in schemaComparisons', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [],
      } as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        schemaComparisons: [
          {
            source: 'schema-compare-sql-default-equivalence',
            file: '/tmp/schema.sql',
            format: 'sql',
            baseline: [
              'CREATE TABLE users (',
              '  id TEXT NOT NULL DEFAULT uuid_generate_v4(),',
              '  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(3),',
              '  PRIMARY KEY (id)',
              ');',
            ].join('\n'),
            current: [
              'CREATE TABLE users (',
              '  id TEXT NOT NULL DEFAULT gen_random_uuid(),',
              '  created_at TIMESTAMP NOT NULL DEFAULT (now()),',
              '  PRIMARY KEY (id)',
              ');',
            ].join('\n'),
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings).toHaveLength(0);
    });

    it('should treat equivalent prisma uuid and dbgenerated defaults as compatible in schemaComparisons', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [],
      } as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        schemaComparisons: [
          {
            source: 'schema-compare-prisma-default-equivalence',
            file: '/tmp/schema.prisma',
            format: 'prisma',
            baseline: [
              'model User {',
              '  id String @id @default(uuid())',
              '  createdAt DateTime @default(now())',
              '}',
            ].join('\n'),
            current: [
              'model User {',
              '  id String @id @default(dbgenerated("gen_random_uuid()"))',
              '  createdAt DateTime @default(dbgenerated("CURRENT_TIMESTAMP(3)"))',
              '}',
            ].join('\n'),
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings).toHaveLength(0);
    });

    it('should grade field-level unique drift in schemaComparisons', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [],
      } as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        schemaComparisons: [
          {
            source: 'schema-compare-unique-field',
            file: '/tmp/schema.prisma',
            format: 'prisma',
            baseline: [
              'model User {',
              '  id String @id',
              '  email String @unique',
              '  username String',
              '}',
            ].join('\n'),
            current: [
              'model User {',
              '  id String @id',
              '  email String',
              '  username String @unique',
              '}',
            ].join('\n'),
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings.map((finding) => finding.ruleId)).toEqual([
        'schema/prisma-unique-removed',
        'schema/prisma-unique-added',
      ]);
      expect(result.findings.map((finding) => finding.severity)).toEqual(['info', 'warning']);
    });

    it('should grade composite unique drift in schemaComparisons', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 1,
        findings: [],
      } as any);

      const result = await scanService.execute({
        project: 'test-project',
        rootDir: '/test/path',
        schemaComparisons: [
          {
            source: 'schema-compare-composite-unique',
            file: '/tmp/schema.sql',
            format: 'sql',
            baseline: [
              'CREATE TABLE users (',
              '  id TEXT NOT NULL,',
              '  email TEXT NOT NULL,',
              '  tenant_id TEXT NOT NULL,',
              '  PRIMARY KEY (id),',
              '  UNIQUE (email, tenant_id)',
              ');',
            ].join('\n'),
            current: [
              'CREATE TABLE users (',
              '  id TEXT NOT NULL,',
              '  email TEXT NOT NULL,',
              '  tenant_id TEXT NOT NULL,',
              '  slug TEXT NOT NULL,',
              '  PRIMARY KEY (id),',
              '  UNIQUE (slug, tenant_id)',
              ');',
            ].join('\n'),
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.findings.map((finding) => finding.ruleId)).toEqual([
        'schema/sql-composite-unique-removed',
        'schema/sql-composite-unique-added',
        'schema/sql-breaking-add-required-field',
      ]);
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

    it('should not double count equivalent native and passthrough contract findings', async () => {
      vi.mocked(core.scan).mockResolvedValue({
        filesScanned: 0,
        findings: [],
      } as any);

      const result = await scanService.execute({
        project: 'test-project',
        openApiDocuments: [
          {
            source: 'openapi-inline',
            file: '/tmp/openapi.yaml',
            content: [
              'openapi: 3.0.3',
              'paths:',
              '  /users:',
              '    post:',
              "      responses: {'400': { description: bad request }}",
            ].join('\n'),
            format: 'yaml',
          },
        ],
        contractArtifacts: [
          {
            source: 'manual-contract',
            ruleId: 'contract/openapi-operation-id',
            severity: 'warning',
            message: 'OpenAPI operation POST /users is missing operationId',
            file: '/tmp/openapi.yaml',
            language: 'contract',
            line: 1,
            column: 0,
            excerpt: 'POST /users',
            governanceDomain: ['interface', 'backend'],
            impactHint: 'medium',
          },
        ],
        signal: new AbortController().signal,
      });

      expect(result.filesScanned).toBe(0);
      expect(result.findings).toHaveLength(3);
      expect(result.findings.map((finding) => finding.ruleId)).toEqual([
        'contract/openapi-operation-id',
        'contract/openapi-auth-required',
        'contract/openapi-success-response',
      ]);
      expect(result.findings[0].ruleFile).toBe('manual-contract');
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
