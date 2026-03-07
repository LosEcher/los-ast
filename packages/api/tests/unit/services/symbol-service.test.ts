/**
 * Symbol Service Unit Tests
 * 符号发现服务单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SymbolService } from '../../../src/services/symbol-service';
import * as core from '@los-ast/core';
import * as fs from 'node:fs/promises';

// Mock Core 模块
vi.mock('@los-ast/core', () => ({
  discoverFiles: vi.fn(),
  isReady: vi.fn().mockReturnValue(true),
}));

// Mock fs
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

describe('SymbolService', () => {
  let symbolService: SymbolService;

  beforeEach(() => {
    vi.clearAllMocks();
    // 重置 isReady 为 true（默认状态）
    vi.mocked(core.isReady).mockReturnValue(true);
    symbolService = new SymbolService();
  });

  describe('discoverSymbols', () => {
    it('should return empty result when no files found', async () => {
      vi.mocked(core.discoverFiles).mockResolvedValue([]);

      const result = await symbolService.discoverSymbols({
        rootDir: '/test/path',
        limit: 100,
        signal: new AbortController().signal,
      });

      expect(result.symbols).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.truncated).toBe(false);
    });

    it('should extract functions from files', async () => {
      vi.mocked(core.discoverFiles).mockResolvedValue(['/test/file.ts']);
      vi.mocked(fs.readFile).mockResolvedValue(`
        function testFunc() { return 1; }
        function anotherFunc() { return 2; }
      `);

      const result = await symbolService.discoverSymbols({
        rootDir: '/test',
        limit: 100,
        signal: new AbortController().signal,
      });

      expect(result.symbols.length).toBeGreaterThanOrEqual(2);
      expect(result.symbols.some(s => s.name === 'testFunc' && s.kind === 'function')).toBe(true);
      expect(result.symbols.some(s => s.name === 'anotherFunc' && s.kind === 'function')).toBe(true);
    });

    it('should apply limit and set truncated flag', async () => {
      vi.mocked(core.discoverFiles).mockResolvedValue(['/test/file.ts']);
      vi.mocked(fs.readFile).mockResolvedValue(`
        function func1() {}
        function func2() {}
        function func3() {}
        function func4() {}
        function func5() {}
      `);

      const result = await symbolService.discoverSymbols({
        rootDir: '/test',
        limit: 3,
        signal: new AbortController().signal,
      });

      expect(result.symbols.length).toBe(3);
      expect(result.truncated).toBe(true);
    });

    it('should throw error when Core is not ready', async () => {
      vi.mocked(core.isReady).mockReturnValue(false);

      await expect(
        symbolService.discoverSymbols({
          rootDir: '/test',
          signal: new AbortController().signal,
        })
      ).rejects.toThrow('Core is not ready');
    });

    it('should respect cancellation signal', async () => {
      const abortController = new AbortController();
      abortController.abort();

      await expect(
        symbolService.discoverSymbols({
          rootDir: '/test',
          signal: abortController.signal,
        })
      ).rejects.toThrow('Operation aborted');
    });
  });
});
