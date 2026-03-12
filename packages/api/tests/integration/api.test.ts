/**
 * API Integration Tests
 * API 端到端集成测试
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import errorHandlerPlugin from '../../src/plugins/error-handler';
import requestIdPlugin from '../../src/plugins/request-id';
import scopeValidatorPlugin from '../../src/plugins/scope-validator';
import cancellationPlugin from '../../src/plugins/cancellation';
import healthCheckPlugin from '../../src/plugins/health-check';
import { scanRoutes, discoverRoutes } from '../../src/routes/core';
import { scanService } from '../../src/services/scan-service';
import { symbolService } from '../../src/services/symbol-service';
import { CoreNotReadyError } from '../../src/types/errors.js';

describe('API Integration Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });

    // 注册插件（与 server.ts 相同顺序）
    await app.register(requestIdPlugin);
    await app.register(errorHandlerPlugin);
    await app.register(healthCheckPlugin);
    await app.register(cancellationPlugin);
    await app.register(scopeValidatorPlugin);

    // 注册路由
    await app.register(scanRoutes, { prefix: '/scan' });
    await app.register(discoverRoutes, { prefix: '/discover' });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Health Endpoints', () => {
    it('GET /healthz/live should return 200 with status alive', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/healthz/live',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('alive');
      expect(body.timestamp).toBeDefined();
    });

    it('GET /healthz/ready should return 200 or 503', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/healthz/ready',
      });

      // 可能是 200 (ready) 或 503 (not ready)
      expect([200, 503]).toContain(response.statusCode);
      const body = JSON.parse(response.body);
      expect(body.status).toBeDefined();
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('Scan Endpoint', () => {
    it('POST /scan should return 400 without scope', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/scan',
        payload: {
          project: 'test',
          rootDir: '/test',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.category).toBe('VALIDATION');
      expect(body.error.code).toBe('MISSING_SCOPE');
    });

    it('POST /scan should return 400 with invalid project', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/scan',
        payload: {
          scope: {
            tenant_id: 'test',
            project_id: 'test',
            actor_id: 'test',
          },
          project: '',
          rootDir: '/test',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.category).toBe('VALIDATION');
    });

    it('POST /scan should include X-Request-ID header', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/scan',
        payload: {
          scope: {
            tenant_id: 'test',
            project_id: 'test',
            actor_id: 'test',
          },
          project: 'test',
          rootDir: '/test',
        },
      });

      // 无论成功失败，都应该有 request ID
      expect(response.headers['x-request-id']).toBeDefined();
    });

    it('POST /scan should merge schemaArtifacts as schema findings', async () => {
      const executeSpy = vi.spyOn(scanService, 'execute').mockResolvedValueOnce({
        filesScanned: 1,
        findings: [
          {
            tool: 'los-ast',
            version: 0,
            timestamp: '2026-03-11T00:00:00.000Z',
            project: 'test',
            ruleFile: 'schema/db.sql',
            ruleId: 'schema/email-nullability',
            findingSource: 'schema',
            severity: 'warning',
            message: 'email 字段应标记为非空',
            file: 'schema/db.sql',
            language: 'schema',
            range: {
              start: {
                line: 12,
                column: 4,
                index: 120,
              },
              end: {
                line: 12,
                column: 5,
                index: 121,
              },
            },
            excerpt: 'email TEXT NULL',
            hasFix: false,
            proposedReplacement: null,
            fingerprint: 'deadbeef',
          },
        ],
      } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/scan',
        payload: {
          scope: {
            tenant_id: 'test',
            project_id: 'test',
            actor_id: 'test',
          },
          project: 'test',
          rootDir: '/test',
          schemaArtifacts: [
            {
              source: 'schema/db.sql',
              ruleId: 'schema/email-nullability',
              severity: 'warning',
              message: 'email 字段应标记为非空',
              file: 'schema/db.sql',
              line: 12,
              column: 4,
              governanceDomain: 'database',
              impactHint: 'medium',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(executeSpy).toHaveBeenCalledWith(expect.objectContaining({
        schemaArtifacts: expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'schema/email-nullability',
            source: 'schema/db.sql',
          }),
        ]),
      }));

      const body = JSON.parse(response.body);
      expect(body.data).toHaveProperty('findings');
      expect(body.data.findings).toHaveLength(1);
      expect(body.data.findings[0].findingSource).toBe('schema');
      expect(body.data.findings[0].language).toBe('schema');
      expect(body.data.findings[0].ruleFile).toBe('schema/db.sql');
      expect(body.data.findings[0].ruleId).toBe('schema/email-nullability');
    });

    it('POST /scan should expose parse failure stats when scan service reports them', async () => {
      vi.spyOn(scanService, 'execute').mockResolvedValueOnce({
        filesScanned: 2,
        findings: [],
        parseFailures: {
          count: 1,
          sampleLimit: 20,
          byLanguage: {
            javascript: 1,
          },
          samples: [
            {
              file: '/tmp/broken.js',
              language: 'javascript',
              error: 'Unexpected token',
            },
          ],
        },
      } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/scan',
        payload: {
          scope: {
            tenant_id: 'test',
            project_id: 'test',
            actor_id: 'test',
          },
          project: 'test',
          rootDir: '/test',
          includeStats: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.parseFailures).toMatchObject({
        count: 1,
        sampleLimit: 20,
        byLanguage: {
          javascript: 1,
        },
        samples: [
          {
            file: '/tmp/broken.js',
            language: 'javascript',
            error: 'Unexpected token',
          },
        ],
      });
    });

    it('POST /scan should forward openApiDocuments to scan service', async () => {
      const executeSpy = vi.spyOn(scanService, 'execute').mockResolvedValueOnce({
        filesScanned: 1,
        findings: [],
      } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/scan',
        payload: {
          scope: {
            tenant_id: 'test',
            project_id: 'test',
            actor_id: 'test',
          },
          project: 'test',
          rootDir: '/test',
          openApiDocuments: [
            {
              source: 'openapi-inline',
              file: '/tmp/openapi.yaml',
              content: 'openapi: 3.0.3\npaths: {}\n',
              format: 'yaml',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(executeSpy).toHaveBeenCalledWith(expect.objectContaining({
        openApiDocuments: expect.arrayContaining([
          expect.objectContaining({
            source: 'openapi-inline',
            file: '/tmp/openapi.yaml',
            format: 'yaml',
          }),
        ]),
      }));
    });

    it('POST /scan should allow native-only requests without rootDir', async () => {
      const executeSpy = vi.spyOn(scanService, 'execute').mockResolvedValueOnce({
        filesScanned: 0,
        findings: [],
      } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/scan',
        payload: {
          scope: {
            tenant_id: 'test',
            project_id: 'test',
            actor_id: 'test',
          },
          project: 'test',
          openApiDocuments: [
            {
              source: 'openapi-inline',
              file: '/tmp/openapi.yaml',
              content: 'openapi: 3.0.3\npaths: {}\n',
              format: 'yaml',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(executeSpy).toHaveBeenCalledWith(expect.objectContaining({
        rootDir: undefined,
        openApiDocuments: expect.arrayContaining([
          expect.objectContaining({
            source: 'openapi-inline',
            file: '/tmp/openapi.yaml',
            format: 'yaml',
          }),
        ]),
      }));
    });

    it('POST /scan should forward openApiComparisons to scan service', async () => {
      const executeSpy = vi.spyOn(scanService, 'execute').mockResolvedValueOnce({
        filesScanned: 1,
        findings: [],
      } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/scan',
        payload: {
          scope: {
            tenant_id: 'test',
            project_id: 'test',
            actor_id: 'test',
          },
          project: 'test',
          rootDir: '/test',
          openApiComparisons: [
            {
              source: 'openapi-compare',
              file: '/tmp/openapi.yaml',
              baseline: 'openapi: 3.0.3\npaths: {}\n',
              current: 'openapi: 3.0.3\npaths: {}\n',
              format: 'yaml',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(executeSpy).toHaveBeenCalledWith(expect.objectContaining({
        openApiComparisons: expect.arrayContaining([
          expect.objectContaining({
            source: 'openapi-compare',
            file: '/tmp/openapi.yaml',
            format: 'yaml',
          }),
        ]),
      }));
    });

    it('POST /scan should forward schemaDocuments to scan service', async () => {
      const executeSpy = vi.spyOn(scanService, 'execute').mockResolvedValueOnce({
        filesScanned: 1,
        findings: [],
      } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/scan',
        payload: {
          scope: {
            tenant_id: 'test',
            project_id: 'test',
            actor_id: 'test',
          },
          project: 'test',
          rootDir: '/test',
          schemaDocuments: [
            {
              source: 'schema-inline',
              file: '/tmp/schema.prisma',
              content: 'model User { id String @id email String? }',
              format: 'prisma',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(executeSpy).toHaveBeenCalledWith(expect.objectContaining({
        schemaDocuments: expect.arrayContaining([
          expect.objectContaining({
            source: 'schema-inline',
            file: '/tmp/schema.prisma',
            format: 'prisma',
          }),
        ]),
      }));
    });

    it('POST /scan should forward contract and schema native inputs together without dropping either channel', async () => {
      const executeSpy = vi.spyOn(scanService, 'execute').mockResolvedValueOnce({
        filesScanned: 1,
        findings: [],
      } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/scan',
        payload: {
          scope: {
            tenant_id: 'test',
            project_id: 'test',
            actor_id: 'test',
          },
          project: 'test',
          rootDir: '/test',
          openApiDocuments: [
            {
              source: 'openapi-inline',
              file: '/tmp/openapi.yaml',
              content: 'openapi: 3.0.3\npaths: {}\n',
              format: 'yaml',
            },
          ],
          schemaDocuments: [
            {
              source: 'schema-inline',
              file: '/tmp/schema.prisma',
              content: 'model User { id String @id email String? }',
              format: 'prisma',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(executeSpy).toHaveBeenCalledWith(expect.objectContaining({
        openApiDocuments: expect.arrayContaining([
          expect.objectContaining({
            source: 'openapi-inline',
            file: '/tmp/openapi.yaml',
            format: 'yaml',
          }),
        ]),
        schemaDocuments: expect.arrayContaining([
          expect.objectContaining({
            source: 'schema-inline',
            file: '/tmp/schema.prisma',
            format: 'prisma',
          }),
        ]),
      }));
    });

    it('POST /scan should forward schemaComparisons to scan service', async () => {
      const executeSpy = vi.spyOn(scanService, 'execute').mockResolvedValueOnce({
        filesScanned: 1,
        findings: [],
      } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/scan',
        payload: {
          scope: {
            tenant_id: 'test',
            project_id: 'test',
            actor_id: 'test',
          },
          project: 'test',
          rootDir: '/test',
          schemaComparisons: [
            {
              source: 'schema-compare',
              file: '/tmp/schema.sql',
              baseline: 'CREATE TABLE users (email TEXT);',
              current: 'CREATE TABLE users (status INTEGER NOT NULL);',
              format: 'sql',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(executeSpy).toHaveBeenCalledWith(expect.objectContaining({
        schemaComparisons: expect.arrayContaining([
          expect.objectContaining({
            source: 'schema-compare',
            file: '/tmp/schema.sql',
            format: 'sql',
          }),
        ]),
      }));
    });

    it('POST /scan should resolve lsclaw-governance rulePack into built-in rule paths', async () => {
      const executeSpy = vi.spyOn(scanService, 'execute').mockResolvedValueOnce({
        filesScanned: 1,
        findings: [],
      } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/scan',
        payload: {
          scope: {
            tenant_id: 'test',
            project_id: 'test',
            actor_id: 'test',
          },
          project: 'test',
          rootDir: '/test',
          rulePack: 'lsclaw-governance',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(executeSpy).toHaveBeenCalledWith(expect.objectContaining({
        rules: expect.arrayContaining([
          expect.stringContaining(path.join('rules', 'projects', 'lsclaw-governance')),
        ]),
      }));
    });

    it('POST /scan should return 503 with explicit service-unavailable when core is not ready', async () => {
      const executeSpy = vi.spyOn(scanService, 'execute').mockRejectedValueOnce(new CoreNotReadyError());

      const response = await app.inject({
        method: 'POST',
        url: '/scan',
        payload: {
          scope: {
            tenant_id: 'test',
            project_id: 'test',
            actor_id: 'test',
          },
          project: 'test',
          rootDir: '/test',
        },
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.error).toMatchObject({
        category: 'SERVICE_UNAVAILABLE',
        code: 'CORE_NOT_READY',
      });
      expect(executeSpy).toHaveBeenCalled();
    });

    it('POST /scan should return 400 when rootDir is missing and no native artifacts are provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/scan',
        payload: {
          scope: {
            tenant_id: 'test',
            project_id: 'test',
            actor_id: 'test',
          },
          project: 'test',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toMatchObject({
        category: 'VALIDATION',
        code: 'INVALID_SCAN_INPUT',
      });
    });

    it('POST /scan should still require rootDir when rulePack implies code scan', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/scan',
        payload: {
          scope: {
            tenant_id: 'test',
            project_id: 'test',
            actor_id: 'test',
          },
          project: 'test',
          rulePack: 'lsclaw-governance',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toMatchObject({
        category: 'VALIDATION',
        code: 'INVALID_ROOTDIR',
      });
    });
  });

  describe('Discover Symbols Endpoint', () => {
    it('POST /discover/symbols should return 400 without scope', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/discover/symbols',
        payload: {
          rootDir: '/test',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('MISSING_SCOPE');
    });

    it('POST /discover/symbols should return 400 with invalid limit', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/discover/symbols',
        payload: {
          scope: {
            tenant_id: 'test',
            project_id: 'test',
            actor_id: 'test',
          },
          rootDir: '/test',
          limit: 0,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.category).toBe('VALIDATION');
    });

    it('POST /discover/symbols should accept valid limit range', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/discover/symbols',
        payload: {
          scope: {
            tenant_id: 'test',
            project_id: 'test',
            actor_id: 'test',
          },
          rootDir: '/test',
          limit: 500,
        },
      });

      // 应该是 200 或错误（因为 /test 可能不存在），但不应该是 400 验证错误
      if (response.statusCode === 400) {
        const body = JSON.parse(response.body);
        expect(body.error.code).not.toBe('INVALID_LIMIT');
      }
    });

    it('POST /discover/symbols should return 503 with explicit service-unavailable when core is not ready', async () => {
      const discoverSpy = vi.spyOn(symbolService, 'discoverSymbols').mockRejectedValueOnce(new CoreNotReadyError());

      const response = await app.inject({
        method: 'POST',
        url: '/discover/symbols',
        payload: {
          scope: {
            tenant_id: 'test',
            project_id: 'test',
            actor_id: 'test',
          },
          rootDir: '/test',
        },
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.error).toMatchObject({
        category: 'SERVICE_UNAVAILABLE',
        code: 'CORE_NOT_READY',
      });
      expect(discoverSpy).toHaveBeenCalled();
    });
  });

  describe('Error Response Format', () => {
    it('should return unified error format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/scan',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);

      // 验证统一错误格式
      expect(body.error).toBeDefined();
      expect(body.error.category).toBeDefined();
      expect(body.error.code).toBeDefined();
      expect(body.error.message).toBeDefined();
      expect(body.error.requestId).toBeDefined();
      expect(body.error.timestamp).toBeDefined();
      expect(body.error.retryable).toBeDefined();
    });
  });
});
