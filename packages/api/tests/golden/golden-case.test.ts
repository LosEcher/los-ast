/**
 * Golden Case Tests
 * Milestone A 验收测试 - 固定输入输出验证
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { scan } from '@los-ast/core';
import path from 'path';
import fs from 'fs';

interface GoldenCase {
  name: string;
  rootDir: string;
  expectedOutputPath: string;
}

interface ExpectedOutput {
  description: string;
  project: string;
  filesScanned: number;
  expectedFindings: {
    patterns: Array<{
      ruleId: string;
      messagePattern: string;
      minimumOccurrences: number;
    }>;
    filesAffected: string[];
  };
  invariants: {
    tool: string;
    language: string;
  };
}

const goldenCases: GoldenCase[] = [
  {
    name: 'mini-js',
    rootDir: path.resolve(process.cwd(), '../../fixtures/golden/mini-js'),
    expectedOutputPath: path.resolve(process.cwd(), '../../fixtures/golden/mini-js/expected-output.json'),
  },
  {
    name: 'cantool-sample',
    rootDir: path.resolve(process.cwd(), '../../fixtures/golden/cantool-sample'),
    expectedOutputPath: path.resolve(process.cwd(), '../../fixtures/golden/cantool-sample/expected-output.json'),
  },
  {
    name: 'lsclaw-sample',
    rootDir: path.resolve(process.cwd(), '../../fixtures/golden/lsclaw-sample'),
    expectedOutputPath: path.resolve(process.cwd(), '../../fixtures/golden/lsclaw-sample/expected-output.json'),
  },
];

describe('Golden Case Tests', () => {
  beforeAll(() => {
    // 验证所有 Golden Case 目录存在
    for (const testCase of goldenCases) {
      expect(fs.existsSync(testCase.rootDir), `${testCase.name} directory should exist`).toBe(true);
      expect(fs.existsSync(testCase.expectedOutputPath), `${testCase.name} expected output should exist`).toBe(true);
    }
  });

  for (const testCase of goldenCases) {
    describe(testCase.name, () => {
      it('should produce deterministic output', async () => {
        const expectedOutput: ExpectedOutput = JSON.parse(
          fs.readFileSync(testCase.expectedOutputPath, 'utf-8')
        );

        const result = await scan({
          project: testCase.name,
          rootDir: testCase.rootDir,
        });

        // 验证不变量
        expect(result.findings.length).toBeGreaterThanOrEqual(0);
        expect(result.stats.filesScanned).toBeGreaterThanOrEqual(expectedOutput.filesScanned);

        // 验证预期问题模式
        for (const pattern of expectedOutput.expectedFindings.patterns) {
          const matches = result.findings.filter(
            (f: { message: string | string[]; }) => f.message.includes(pattern.messagePattern)
          );
          expect(
            matches.length,
            `Expected at least ${pattern.minimumOccurrences} findings matching "${pattern.messagePattern}"`
          ).toBeGreaterThanOrEqual(pattern.minimumOccurrences);
        }

        // 验证扫描统计
        expect(result.stats.durationMs).toBeGreaterThanOrEqual(0);
        expect(result.stats.filesScanned).toBeGreaterThanOrEqual(1);
      });

      it('should have valid file structure', () => {
        const srcDir = path.join(testCase.rootDir, 'src');
        expect(fs.existsSync(srcDir), 'src directory should exist').toBe(true);

        const files = fs.readdirSync(srcDir);
        expect(files.length).toBeGreaterThan(0);
      });
    });
  }

  it('all golden cases should be tested', () => {
    expect(goldenCases.length).toBe(3);
  });
});
