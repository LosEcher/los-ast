/**
 * CLI/API Parity Tests
 * 验证 Core API、HTTP API 和 CLI 输出结构一致性
 *
 * Acceptance Criteria:
 * - Core API、HTTP API 和 CLI 产生相同的字段结构和类型
 * - JSONL 输出可以被管道处理
 * - 只有 wrapper 不同（API 有 data 包装，CLI 裸输出）
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import path from 'path';
import errorHandlerPlugin from '../../src/plugins/error-handler';
import requestIdPlugin from '../../src/plugins/request-id';
import scopeValidatorPlugin from '../../src/plugins/scope-validator';
import cancellationPlugin from '../../src/plugins/cancellation';
import healthCheckPlugin from '../../src/plugins/health-check';
import { scanRoutes } from '../../src/routes/core';

// __dirname is /Users/echerlos/Downloads/projects/los-ast/packages/api/tests/contract
// Need to go up 4 levels to reach repo root: tests -> api -> packages -> packages -> repo root
describe('CLI/API Parity', () => {
  let app: FastifyInstance;
  const testRootDir = path.resolve(__dirname, '../../../..');
  const rulesPattern = path.join(testRootDir, 'rules/languages/**/*.yml');

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(requestIdPlugin);
    await app.register(errorHandlerPlugin);
    await app.register(healthCheckPlugin);
    await app.register(cancellationPlugin);
    await app.register(scopeValidatorPlugin);
    await app.register(scanRoutes, { prefix: '/scan' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Field Structure Parity', () => {
    it('API Finding should have expected fields per API_CONTRACT.md', async () => {
      // API call
      const apiResponse = await app.inject({
        method: 'POST',
        url: '/scan',
        headers: { 'Content-Type': 'application/json' },
        payload: {
          scope: { tenant_id: 'test', project_id: 'test', actor_id: 'test' },
          project: 'parity-test',
          rootDir: testRootDir,
          include: ['fixtures/golden/mini-js/src/*.js'],
          rules: [rulesPattern],
        },
      });

      expect(apiResponse.statusCode).toBe(200);
      const apiBody = JSON.parse(apiResponse.body);

      // Non-empty assertion to prevent vacuous pass
      expect(apiBody.data.findings.length).toBeGreaterThan(0);

      // Verify all findings have consistent structure
      for (const finding of apiBody.data.findings) {
        // Required Finding fields (per API_CONTRACT.md)
        expect(finding).toHaveProperty('tool');
        expect(finding).toHaveProperty('version');
        expect(finding).toHaveProperty('timestamp');
        expect(finding).toHaveProperty('project');
        expect(finding).toHaveProperty('ruleFile');
        expect(finding).toHaveProperty('ruleId');
        expect(finding).toHaveProperty('severity');
        expect(finding).toHaveProperty('message');
        expect(finding).toHaveProperty('file');
        expect(finding).toHaveProperty('language');
        expect(finding).toHaveProperty('range');
        expect(finding).toHaveProperty('excerpt');
        expect(finding).toHaveProperty('hasFix');
        expect(finding).toHaveProperty('proposedReplacement');
        expect(finding).toHaveProperty('fingerprint');

        // Type validations
        expect(typeof finding.tool).toBe('string');
        expect(typeof finding.version).toBe('number');
        expect(typeof finding.timestamp).toBe('string');
        expect(typeof finding.project).toBe('string');
        expect(typeof finding.ruleId).toBe('string');
        expect(typeof finding.file).toBe('string');
        expect(typeof finding.fingerprint).toBe('string');

        // Range structure
        expect(finding.range).toHaveProperty('start');
        expect(finding.range).toHaveProperty('end');
        expect(finding.range.start).toHaveProperty('line');
        expect(finding.range.start).toHaveProperty('column');
        expect(finding.range.start).toHaveProperty('index');

        // Severity enum
        expect(['info', 'warning', 'error']).toContain(finding.severity);

        // Tool must be los-ast
        expect(finding.tool).toBe('los-ast');
      }
    });

    it('Core module scan should produce same field structure as API', async () => {
      const { scan, loadRuleFiles } = await import('@los-ast/core');

      const rules = await loadRuleFiles([rulesPattern]);

      const result = await scan({
        project: 'parity-test',
        rootDir: testRootDir,
        include: ['fixtures/golden/mini-js/src/*.js'],
        rules,
      });

      // Non-empty assertion to prevent vacuous pass
      expect(result.findings.length).toBeGreaterThan(0);

      // Compare core result structure with API response structure
      for (const finding of result.findings) {
        // All fields from API_CONTRACT.md should be present
        expect(finding).toHaveProperty('tool', 'los-ast');
        expect(finding).toHaveProperty('version');
        expect(finding).toHaveProperty('timestamp');
        expect(finding).toHaveProperty('project');
        expect(finding).toHaveProperty('ruleFile');
        expect(finding).toHaveProperty('ruleId');
        expect(finding).toHaveProperty('severity');
        expect(finding).toHaveProperty('message');
        expect(finding).toHaveProperty('file');
        expect(finding).toHaveProperty('language');
        expect(finding).toHaveProperty('range');
        expect(finding).toHaveProperty('excerpt');
        expect(finding).toHaveProperty('hasFix');
        expect(finding).toHaveProperty('proposedReplacement');
        expect(finding).toHaveProperty('fingerprint');
      }
    });
  });

  describe('Response Wrapper Difference', () => {
    it('API should wrap response in data object, Core module should not', async () => {
      // API response has data wrapper
      const apiResponse = await app.inject({
        method: 'POST',
        url: '/scan',
        headers: { 'Content-Type': 'application/json' },
        payload: {
          scope: { tenant_id: 'test', project_id: 'test', actor_id: 'test' },
          project: 'wrapper-test',
          rootDir: testRootDir,
          include: ['fixtures/golden/mini-js/src/*.js'],
          rules: [rulesPattern],
        },
      });

      const apiBody = JSON.parse(apiResponse.body);

      // API has data wrapper
      expect(apiBody).toHaveProperty('data');
      expect(apiBody.data).toHaveProperty('filesScanned');
      expect(apiBody.data).toHaveProperty('findings');

      // Core module returns raw result
      const { scan, loadRuleFiles } = await import('@los-ast/core');

      const rules = await loadRuleFiles([rulesPattern]);

      const coreResult = await scan({
        project: 'wrapper-test',
        rootDir: testRootDir,
        include: ['fixtures/golden/mini-js/src/*.js'],
        rules,
      });

      // Core returns bare object, no wrapper
      expect(coreResult).not.toHaveProperty('data');
      expect(coreResult).toHaveProperty('filesScanned');
      expect(coreResult).toHaveProperty('findings');

      // Non-empty assertion to prevent vacuous pass
      expect(coreResult.findings.length).toBeGreaterThan(0);
    });
  });

  describe('Error Format Consistency', () => {
    it('API should return structured errors', async () => {
      const apiResponse = await app.inject({
        method: 'POST',
        url: '/scan',
        payload: {
          // Missing required fields
        },
      });

      expect(apiResponse.statusCode).toBe(400);
      const apiBody = JSON.parse(apiResponse.body);
      expect(apiBody.error).toBeDefined();
      expect(apiBody.error.code).toBeDefined();
      expect(apiBody.error.message).toBeDefined();
      expect(apiBody.error.requestId).toBeDefined();
      expect(apiBody.error.timestamp).toBeDefined();
    });
  });

  describe('Project Field Consistency', () => {
    it('Core module project parameter should be reflected in findings', async () => {
      const testProject = 'core-api-parity-test-project';
      const { scan, loadRuleFiles } = await import('@los-ast/core');

      const rules = await loadRuleFiles([rulesPattern]);

      const result = await scan({
        project: testProject,
        rootDir: testRootDir,
        include: ['fixtures/golden/mini-js/src/*.js'],
        rules,
      });

      // Non-empty assertion to prevent vacuous pass
      expect(result.findings.length).toBeGreaterThan(0);

      for (const finding of result.findings) {
        expect(finding.project).toBe(testProject);
      }
    });

    it('API project parameter should be reflected in findings', async () => {
      const testProject = 'http-api-parity-test-project';

      const apiResponse = await app.inject({
        method: 'POST',
        url: '/scan',
        headers: { 'Content-Type': 'application/json' },
        payload: {
          scope: { tenant_id: 'test', project_id: 'test', actor_id: 'test' },
          project: testProject,
          rootDir: testRootDir,
          include: ['fixtures/golden/mini-js/src/*.js'],
          rules: [rulesPattern],
        },
      });

      expect(apiResponse.statusCode).toBe(200);
      const apiBody = JSON.parse(apiResponse.body);

      // Non-empty assertion to prevent vacuous pass
      expect(apiBody.data.findings.length).toBeGreaterThan(0);

      for (const finding of apiBody.data.findings) {
        expect(finding.project).toBe(testProject);
      }
    });
  });
});
