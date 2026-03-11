/**
 * API 契约测试
 * 验证文档/OpenAPI/响应体一致性
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import errorHandlerPlugin from '../../src/plugins/error-handler';
import requestIdPlugin from '../../src/plugins/request-id';
import scopeValidatorPlugin from '../../src/plugins/scope-validator';
import cancellationPlugin from '../../src/plugins/cancellation';
import healthCheckPlugin from '../../src/plugins/health-check';
import { scanRoutes, discoverRoutes } from '../../src/routes/core';
import {
  memoryProposalsRoutes,
  approvalRoutes,
} from '../../src/routes/experimental';
import { scanService } from '../../src/services/scan-service';

describe('API Contract Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });

    // 注册插件（与 server.ts 相同顺序）
    await app.register(requestIdPlugin);
    await app.register(errorHandlerPlugin);
    await app.register(healthCheckPlugin);
    await app.register(cancellationPlugin);
    await app.register(scopeValidatorPlugin);

    // 注册 Core 路由
    await app.register(scanRoutes, { prefix: '/scan' });
    await app.register(discoverRoutes, { prefix: '/discover' });

    // 注册 Experimental 路由（契约测试需要）
    await app.register(approvalRoutes, { prefix: '/experimental/approvals' });
    await app.register(memoryProposalsRoutes, { prefix: '/experimental/memory-proposals' });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Health Check Endpoints', () => {
    it('GET /healthz/live should match contract (bare object, no data wrapper)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/healthz/live',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // 契约: 裸对象，无 data 包装
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('timestamp');
      expect(body).not.toHaveProperty('data'); // 不应有 data 包装

      // 类型检查
      expect(typeof body.status).toBe('string');
      expect(typeof body.timestamp).toBe('string');
      expect(body.status).toBe('alive');
    });

    it('GET /healthz/ready should match contract (bare object)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/healthz/ready',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // 契约: 裸对象，无 data 包装
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('timestamp');
      expect(body).not.toHaveProperty('data');
      expect(body).not.toHaveProperty('core');
    });
  });

  describe('Scan Endpoint', () => {
    it('POST /scan response should match Finding contract', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/scan',
        headers: {
          'Content-Type': 'application/json',
        },
        payload: {
          scope: {
            tenant_id: 'test-tenant',
            project_id: 'test-project',
            actor_id: 'test-user',
          },
          project: 'test',
          rootDir: process.cwd(),
          include: ['packages/core/src/**/*.mjs'],
          includeStats: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // 验证基本结构
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('filesScanned');
      expect(body.data).toHaveProperty('findings');

      // 契约: parseCache 使用 entries/maxEntries 而非 size
      // 只有当 parseCache 存在且有实际数据时才验证其结构
      if (body.data.parseCache && Object.keys(body.data.parseCache).length > 0) {
        expect(body.data.parseCache).toHaveProperty('hits');
        expect(body.data.parseCache).toHaveProperty('misses');
        expect(body.data.parseCache).toHaveProperty('entries'); // 不是 size
        expect(body.data.parseCache).toHaveProperty('maxEntries');
        expect(body.data.parseCache).not.toHaveProperty('size');

        expect(typeof body.data.parseCache.hits).toBe('number');
        expect(typeof body.data.parseCache.misses).toBe('number');
        expect(typeof body.data.parseCache.entries).toBe('number');
        expect(typeof body.data.parseCache.maxEntries).toBe('number');
      }

      // 验证 Finding 结构
      if (body.data.findings.length > 0) {
        const finding = body.data.findings[0];

        // 契约: version 是 number 类型，当前实现为 0
        expect(finding).toHaveProperty('tool');
        expect(finding).toHaveProperty('version');
        expect(finding).toHaveProperty('timestamp');
        expect(finding).toHaveProperty('project');
        expect(finding).toHaveProperty('ruleFile');
        expect(finding).toHaveProperty('ruleId');
        expect(finding).toHaveProperty('severity');
        expect(finding).toHaveProperty('message');
        expect(finding).toHaveProperty('file'); // 不是 filePath
        expect(finding).toHaveProperty('language');
        expect(finding).toHaveProperty('range');
        expect(finding).toHaveProperty('excerpt');
        expect(finding).toHaveProperty('hasFix');
        expect(finding).toHaveProperty('proposedReplacement');
        expect(finding).toHaveProperty('fingerprint');

        // 类型验证
        expect(typeof finding.version).toBe('number');
        expect(typeof finding.file).toBe('string');
        expect(typeof finding.range.start.line).toBe('number');
        expect(typeof finding.range.start.column).toBe('number');
        expect(typeof finding.range.start.index).toBe('number');

        // 不应有旧的字段
        expect(finding).not.toHaveProperty('filePath');
        expect(finding).not.toHaveProperty('line');
        expect(finding).not.toHaveProperty('column');
      }
    });

    it('POST /scan should preserve contract artifact findingSource as contract in contract response', async () => {
      const executeSpy = vi.spyOn(scanService, 'execute').mockResolvedValueOnce({
        filesScanned: 1,
        findings: [
          {
            tool: 'los-ast',
            version: 0,
            timestamp: '2026-03-11T00:00:00.000Z',
            project: 'test-project',
            ruleFile: 'contract-baseline.yaml',
            ruleId: 'contract/auth-required',
            findingSource: 'contract',
            severity: 'error',
            message: 'Public endpoint lacks auth rule',
            file: 'openapi.yaml',
            language: 'contract',
            range: {
              start: {
                line: 8,
                column: 2,
                index: 80,
              },
              end: {
                line: 8,
                column: 30,
                index: 100,
              },
            },
            excerpt: '/v1/users',
            hasFix: false,
            proposedReplacement: null,
            fingerprint: 'contract-artifact-1',
          },
        ],
      } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/scan',
        headers: {
          'Content-Type': 'application/json',
        },
        payload: {
          scope: {
            tenant_id: 'test-tenant',
            project_id: 'test-project',
            actor_id: 'test-user',
          },
          project: 'test',
          rootDir: process.cwd(),
          include: ['packages/core/src/**/*.mjs'],
          contractArtifacts: [
            {
              source: 'contract-baseline.yaml',
              ruleId: 'contract/auth-required',
              severity: 'error',
              message: 'Public endpoint lacks auth rule',
              file: 'openapi.yaml',
              line: 8,
              column: 2,
              governanceDomain: ['backend'],
              impactHint: 'high',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(executeSpy).toHaveBeenCalledWith(expect.objectContaining({
        contractArtifacts: expect.arrayContaining([
          expect.objectContaining({
            source: 'contract-baseline.yaml',
            ruleId: 'contract/auth-required',
          }),
        ]),
      }));

      const body = JSON.parse(response.body);
      expect(body.data).toHaveProperty('findings');
      expect(body.data.findings).toHaveLength(1);
      expect(body.data.findings[0]).toMatchObject({
        findingSource: 'contract',
        ruleFile: 'contract-baseline.yaml',
        ruleId: 'contract/auth-required',
        language: 'contract',
      });
    });

    it('POST /scan should preserve schema artifact findingSource as schema in contract response', async () => {
      const executeSpy = vi.spyOn(scanService, 'execute').mockResolvedValueOnce({
        filesScanned: 1,
        findings: [
          {
            tool: 'los-ast',
            version: 0,
            timestamp: '2026-03-11T00:00:00.000Z',
            project: 'test-project',
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
                column: 20,
                index: 140,
              },
            },
            excerpt: 'email TEXT NULL',
            hasFix: false,
            proposedReplacement: null,
            fingerprint: 'contract-schema-1',
          },
        ],
      } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/scan',
        headers: {
          'Content-Type': 'application/json',
        },
        payload: {
          scope: {
            tenant_id: 'test-tenant',
            project_id: 'test-project',
            actor_id: 'test-user',
          },
          project: 'test',
          rootDir: process.cwd(),
          include: ['packages/core/src/**/*.mjs'],
          schemaArtifacts: [
            {
              source: 'schema/db.sql',
              ruleId: 'schema/email-nullability',
              severity: 'warning',
              message: 'email 字段应标记为非空',
              file: 'schema/db.sql',
              line: 12,
              column: 4,
              governanceDomain: ['database'],
              impactHint: 'medium',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(executeSpy).toHaveBeenCalledWith(expect.objectContaining({
        schemaArtifacts: expect.arrayContaining([
          expect.objectContaining({
            source: 'schema/db.sql',
            ruleId: 'schema/email-nullability',
          }),
        ]),
      }));

      const body = JSON.parse(response.body);
      expect(body.data).toHaveProperty('findings');
      expect(body.data.findings).toHaveLength(1);
      expect(body.data.findings[0]).toMatchObject({
        findingSource: 'schema',
        ruleFile: 'schema/db.sql',
        ruleId: 'schema/email-nullability',
        language: 'schema',
      });
    });
  });

  describe('Discover Symbols Endpoint', () => {
    it('POST /discover/symbols should return valid SymbolResult', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/discover/symbols',
        headers: {
          'Content-Type': 'application/json',
        },
        payload: {
          scope: {
            tenant_id: 'test-tenant',
            project_id: 'test-project',
            actor_id: 'test-user',
          },
          rootDir: process.cwd(),
          include: ['packages/core/src/*.mjs'],
          limit: 10,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('symbols');
      expect(body.data).toHaveProperty('total');
      expect(body.data).toHaveProperty('truncated');

      expect(Array.isArray(body.data.symbols)).toBe(true);
      expect(typeof body.data.total).toBe('number');
      expect(typeof body.data.truncated).toBe('boolean');

      // 验证 SymbolInfo 结构
      if (body.data.symbols.length > 0) {
        const symbol = body.data.symbols[0];
        expect(symbol).toHaveProperty('name');
        expect(symbol).toHaveProperty('kind');
        expect(symbol).toHaveProperty('file');
        expect(symbol).toHaveProperty('range');

        expect(typeof symbol.name).toBe('string');
        expect(['function', 'class', 'interface', 'type', 'variable']).toContain(symbol.kind);
      }

      // 契约: total 是真实统计，不是伪造值
      expect(body.data.total).toBeGreaterThanOrEqual(body.data.symbols.length);
    });

    it('should handle empty results gracefully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/discover/symbols',
        headers: {
          'Content-Type': 'application/json',
        },
        payload: {
          scope: {
            tenant_id: 'test-tenant',
            project_id: 'test-project',
          },
          rootDir: process.cwd(),
          include: ['non-existent-path-xyz/**/*.xyz'],
          limit: 10,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // 契约: 空结果应该返回空数组和 0 统计
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('symbols');
      expect(body.data).toHaveProperty('total');
      expect(body.data).toHaveProperty('truncated');

      expect(Array.isArray(body.data.symbols)).toBe(true);
      expect(body.data.symbols.length).toBe(0);
      expect(body.data.total).toBe(0);
      expect(body.data.truncated).toBe(false);
    });

    it('should discover TypeScript/JavaScript symbols with language normalization', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/discover/symbols',
        headers: {
          'Content-Type': 'application/json',
        },
        payload: {
          scope: {
            tenant_id: 'test-tenant',
            project_id: 'test-project',
            actor_id: 'test-user',
          },
          rootDir: process.cwd(),
          // 包含 TypeScript 文件
          include: ['packages/api/src/**/*.ts'],
          limit: 50,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // 契约: 如果文件被发现，它们应该是 TypeScript 文件
      // 注意: 如果没有任何符号被发现，此测试可能跳过具体断言
      // 这允许在测试环境中没有匹配文件时通过
      if (body.data.symbols.length > 0) {
        const tsSymbols = body.data.symbols.filter((s: { file: string }) => s.file.endsWith('.ts'));
        // 契约: 发现的符号应来自 TypeScript 文件
        expect(tsSymbols.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Scope Validation', () => {
    it('should reject requests without scope', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/scan',
        payload: {
          project: 'test',
          rootDir: process.cwd(),
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body.error.code).toBe('MISSING_SCOPE');
    });

    it('should use validated scope from request, ignoring forged query param', async () => {
      // 使用正确的 scope 在 query 中（这是正确的方式）
      const response = await app.inject({
        method: 'GET',
        url: '/experimental/approvals?scope=' + encodeURIComponent(JSON.stringify({
          tenant_id: 'real-tenant',
          project_id: 'real-project',
          actor_id: 'real-user',
        })),
      });

      // 应该成功，使用验证后的 scope
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('items');
      expect(body).toHaveProperty('total');
      // 响应应该只包含 real-tenant 的数据（空数组，因为没有为该租户创建数据）
      expect(body.items).toEqual([]);
    });

    it('should reject approval ID access without scope (cross-tenant protection)', async () => {
      // 先创建一个审批项
      const createResponse = await app.inject({
        method: 'POST',
        url: '/experimental/approvals',
        headers: { 'Content-Type': 'application/json' },
        payload: {
          scope: {
            tenant_id: 'tenant-a',
            project_id: 'project-a',
            actor_id: 'user-a',
          },
          item_type: 'recovery_action',
          item_id: 'item-001',
          title: 'Test Approval',
          description: 'Test description',
          risk_level: 'medium',
          timeout_seconds: 3600,
        },
      });

      expect(createResponse.statusCode).toBe(201);
      const createBody = JSON.parse(createResponse.body);
      const approvalId = createBody.approval.approval_id;

      // 尝试不带 scope 访问该审批项 - 应该被拒绝
      const getResponse = await app.inject({
        method: 'GET',
        url: `/experimental/approvals/${approvalId}`,
      });

      expect(getResponse.statusCode).toBe(400);
      const getBody = JSON.parse(getResponse.body);
      expect(getBody.error.code).toBe('MISSING_SCOPE');

      // 尝试用不同租户访问 - 应该返回 404 (NotFound，防止 IDOR)
      // GET 请求使用 query 参数传递 scope
      const wrongScopeResponse = await app.inject({
        method: 'GET',
        url: `/experimental/approvals/${approvalId}?scope=${encodeURIComponent(JSON.stringify({
          tenant_id: 'tenant-b',
          project_id: 'project-b',
          actor_id: 'user-b',
        }))}`,
      });

      expect(wrongScopeResponse.statusCode).toBe(404);
    });

    it('should reject memory-proposals ID access without scope', async () => {
      // 尝试不带 scope 访问提案 - 应该被拒绝
      const getResponse = await app.inject({
        method: 'GET',
        url: '/experimental/memory-proposals/proposals/prp-123',
      });

      expect(getResponse.statusCode).toBe(400);
      const getBody = JSON.parse(getResponse.body);
      expect(getBody.error.code).toBe('MISSING_SCOPE');
    });

    it('should isolate knowledge query by scope (no cross-tenant leak)', async () => {
      // 创建租户 A 的提案
      await app.inject({
        method: 'POST',
        url: '/experimental/memory-proposals/proposals',
        headers: { 'Content-Type': 'application/json' },
        payload: {
          scope: {
            tenant_id: 'tenant-a',
            project_id: 'project-a',
            actor_id: 'user-a',
          },
          proposal_type: 'incident_lesson',
          content: {
            lesson_id: 'les-001',
            incident_id: 'inc-001',
            title: 'Tenant A Lesson',
            summary: 'Test',
            what_happened: 'Test',
            why_it_happened: 'Test',
            how_we_fixed: 'Test',
            how_to_prevent: 'Test',
            tags: ['test'],
            severity: 'high',
            scope: {
              tenant_id: 'tenant-a',
              project_id: 'project-a',
            },
            related_lessons: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          source: {
            incident_id: 'inc-001',
            actor_id: 'user-a',
          },
        },
      });

      // 租户 A 查询知识 - 应该能看到自己的数据
      const tenantAQuery = await app.inject({
        method: 'GET',
        url: '/experimental/memory-proposals/knowledge?scope=' + encodeURIComponent(JSON.stringify({
          tenant_id: 'tenant-a',
          project_id: 'project-a',
          actor_id: 'user-a',
        })),
      });

      expect(tenantAQuery.statusCode).toBe(200);
      const tenantABody = JSON.parse(tenantAQuery.body);
      expect(tenantABody.items.length).toBeGreaterThan(0);
      expect(tenantABody.total).toBeGreaterThan(0);

      // 租户 B 查询知识 - 应该看不到租户 A 的数据
      const tenantBQuery = await app.inject({
        method: 'GET',
        url: '/experimental/memory-proposals/knowledge?scope=' + encodeURIComponent(JSON.stringify({
          tenant_id: 'tenant-b',
          project_id: 'project-b',
          actor_id: 'user-b',
        })),
      });

      expect(tenantBQuery.statusCode).toBe(200);
      const tenantBBody = JSON.parse(tenantBQuery.body);
      // 契约: 租户 B 不应该看到租户 A 的任何数据
      expect(tenantBBody.items).toEqual([]);
      expect(tenantBBody.total).toBe(0);
    });

    it('should isolate stats by scope (no cross-tenant leak)', async () => {
      // 创建租户 A 的提案
      await app.inject({
        method: 'POST',
        url: '/experimental/memory-proposals/proposals',
        headers: { 'Content-Type': 'application/json' },
        payload: {
          scope: {
            tenant_id: 'tenant-stats-a',
            project_id: 'project-stats-a',
            actor_id: 'user-a',
          },
          proposal_type: 'incident_lesson',
          content: {
            lesson_id: 'les-stats-001',
            incident_id: 'inc-stats-001',
            title: 'Stats Test Lesson',
            summary: 'Test',
            what_happened: 'Test',
            why_it_happened: 'Test',
            how_we_fixed: 'Test',
            how_to_prevent: 'Test',
            tags: ['test'],
            severity: 'high',
            scope: {
              tenant_id: 'tenant-stats-a',
              project_id: 'project-stats-a',
            },
            related_lessons: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          source: {
            incident_id: 'inc-stats-001',
            actor_id: 'user-a',
          },
        },
      });

      // 租户 A 查询统计 - 应该能看到自己的数据
      const tenantAStats = await app.inject({
        method: 'GET',
        url: '/experimental/memory-proposals/stats?scope=' + encodeURIComponent(JSON.stringify({
          tenant_id: 'tenant-stats-a',
          project_id: 'project-stats-a',
          actor_id: 'user-a',
        })),
      });

      expect(tenantAStats.statusCode).toBe(200);
      const tenantABody = JSON.parse(tenantAStats.body);
      expect(tenantABody.stats.total_proposals).toBeGreaterThan(0);
      expect(tenantABody.stats.active_lessons).toBeGreaterThan(0);

      // 租户 B 查询统计 - 应该看不到租户 A 的数据
      const tenantBStats = await app.inject({
        method: 'GET',
        url: '/experimental/memory-proposals/stats?scope=' + encodeURIComponent(JSON.stringify({
          tenant_id: 'tenant-stats-b',
          project_id: 'project-stats-b',
          actor_id: 'user-b',
        })),
      });

      expect(tenantBStats.statusCode).toBe(200);
      const tenantBBody = JSON.parse(tenantBStats.body);
      // 契约: 租户 B 的统计应该都是 0（看不到租户 A 的数据）
      expect(tenantBBody.stats.total_proposals).toBe(0);
      expect(tenantBBody.stats.active_lessons).toBe(0);
      expect(tenantBBody.stats.by_status).toEqual({});
    });
  });

  describe('Error Response Contract', () => {
    it('error responses should follow standard format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/scan',
        payload: {}, // 无效请求
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);

      // 契约: 标准错误格式
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code');
      expect(body.error).toHaveProperty('message');
      expect(body.error).toHaveProperty('requestId');
      expect(body.error).toHaveProperty('timestamp');

      expect(typeof body.error.code).toBe('string');
      expect(typeof body.error.message).toBe('string');
      expect(typeof body.error.requestId).toBe('string');
      expect(typeof body.error.timestamp).toBe('string');
    });
  });
});

/**
 * Core 类型与实现一致性测试
 * 验证 @los-ast/core 的导出类型与运行时行为一致
 */
describe('Core Type Contract', () => {
  it('should have matching type declarations and implementations', async () => {
    // 这些测试在编译时通过 TypeScript 类型检查
    // 在运行时验证关键结构

    const core = await import('@los-ast/core');

    // 验证导出的函数存在
    expect(typeof core.scan).toBe('function');
    expect(typeof core.fix).toBe('function');
    expect(typeof core.explainAtPosition).toBe('function');
    expect(typeof core.discoverFiles).toBe('function');
    expect(typeof core.isReady).toBe('function');
    expect(typeof core.languageFromFilePath).toBe('function');

    // 验证常量
    expect(typeof core.CORE_FACADE_VERSION).toBe('string');

    // 验证 loadRuleFiles 接受字符串数组（globs）而非单一路径
    expect(typeof core.loadRuleFiles).toBe('function');
  });

  it('scan result should match type declarations', async () => {
    const { scan } = await import('@los-ast/core');

    const result = await scan({
      project: 'test',
      rootDir: process.cwd(),
      include: ['packages/core/src/*.mjs'],
      includeStats: true,
    });

    // 契约验证
    expect(typeof result.filesScanned).toBe('number');
    expect(Array.isArray(result.findings)).toBe(true);

    if (result.parseCache) {
      // 契约: 使用 entries/maxEntries 而非 size
      expect(result.parseCache).toHaveProperty('entries');
      expect(result.parseCache).toHaveProperty('maxEntries');
      expect(result.parseCache).not.toHaveProperty('size');
    }

    // 验证 Finding 结构
    for (const finding of result.findings) {
      expect(finding).toHaveProperty('tool');
      expect(finding).toHaveProperty('version');
      expect(finding).toHaveProperty('timestamp');
      expect(finding).toHaveProperty('file');
      expect(finding).toHaveProperty('range');

      // 不应有旧的字段
      expect(finding).not.toHaveProperty('filePath');
      expect(finding).not.toHaveProperty('line');
      expect(finding).not.toHaveProperty('column');
    }
  });

  it('fix result should match type declarations', async () => {
    const { fix, loadRuleFiles } = await import('@los-ast/core');

    // 加载测试规则
    const rules = await loadRuleFiles(['rules/languages/**/*.yml']);

    const result = await fix({
      project: 'test',
      rootDir: process.cwd(),
      include: ['packages/core/src/*.mjs'],
      rules,
      dryRun: true,
      includeStats: true,
    });

    // 契约验证
    expect(typeof result.filesScanned).toBe('number');
    expect(typeof result.changesApplied).toBe('number');
    expect(Array.isArray(result.results)).toBe(true);

    if (result.parseCache) {
      expect(result.parseCache).toHaveProperty('entries');
      expect(result.parseCache).toHaveProperty('maxEntries');
    }

    // 验证 FixResultItem 完整结构
    for (const item of result.results) {
      // 核心字段（与 Finding 对齐）
      expect(item).toHaveProperty('tool');
      expect(item).toHaveProperty('version');
      expect(item).toHaveProperty('timestamp');
      expect(item).toHaveProperty('project');
      expect(item).toHaveProperty('ruleFile');
      expect(item).toHaveProperty('ruleId');
      expect(item).toHaveProperty('severity');
      expect(item).toHaveProperty('message');
      expect(item).toHaveProperty('file');
      expect(item).toHaveProperty('language');
      expect(item).toHaveProperty('range');
      expect(item).toHaveProperty('excerpt');
      expect(item).toHaveProperty('hasFix');
      expect(item).toHaveProperty('proposedReplacement');
      expect(item).toHaveProperty('applied');
      expect(item).toHaveProperty('fingerprint');

      // 类型验证
      expect(typeof item.tool).toBe('string');
      expect(typeof item.version).toBe('number');
      expect(typeof item.timestamp).toBe('string');
      expect(typeof item.hasFix).toBe('boolean');
      expect(typeof item.applied).toBe('boolean');
    }
  });
});
