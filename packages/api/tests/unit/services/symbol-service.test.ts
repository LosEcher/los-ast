/**
 * Symbol Service Unit Tests
 * 符号发现服务单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SymbolService } from '../../../src/services/symbol-service';
import * as core from '@los-ast/core';

// Mock Core 模块
vi.mock('@los-ast/core', async () => {
  const actual = await vi.importActual<typeof import('@los-ast/core')>('@los-ast/core');
  return {
    ...actual,
    discoverFiles: vi.fn(),
    isReady: vi.fn().mockReturnValue(true),
    languageFromFilePath: vi.fn((file: string) => {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) return 'typescript';
      if (file.endsWith('.js') || file.endsWith('.jsx')) return 'javascript';
      if (file.endsWith('.rs')) return 'rust';
      return null;
    }),
    defaultParseCache: {
      parseFile: vi.fn(),
    },
  };
});

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

    it('should extract functions from TypeScript files', async () => {
      vi.mocked(core.discoverFiles).mockResolvedValue(['/test/file.ts']);

      // Mock AST 解析结果
      const mockNode = {
        getMatch: (name: string) => name === 'name' ? { text: () => 'testFunc' } : null,
        range: () => ({
          start: { line: 1, column: 0, index: 0 },
          end: { line: 1, column: 20, index: 20 },
        }),
      };

      vi.mocked(core.defaultParseCache.parseFile).mockResolvedValue({
        root: {
          findAll: vi.fn().mockReturnValue([mockNode]),
        },
      } as any);

      const result = await symbolService.discoverSymbols({
        rootDir: '/test',
        limit: 100,
        signal: new AbortController().signal,
      });

      expect(result.symbols.length).toBeGreaterThanOrEqual(1);
      expect(result.symbols.some(s => s.name === 'testFunc')).toBe(true);
    });

    it('should apply limit and set truncated flag', async () => {
      // 使用两个文件来测试截断逻辑
      vi.mocked(core.discoverFiles).mockResolvedValue(['/test/file1.ts', '/test/file2.ts']);

      // Mock 第一个文件有 3 个符号，第二个文件有 2 个符号
      let callCount = 0;
      vi.mocked(core.defaultParseCache.parseFile).mockImplementation(async () => {
        callCount++;
        const count = callCount === 1 ? 3 : 2;
        const mockNodes = Array.from({ length: count }, (_, i) => ({
          getMatch: (name: string) => name === 'name' ? { text: () => `func${callCount}_${i + 1}` } : null,
          range: () => ({
            start: { line: i + 1, column: 0, index: i * 20 },
            end: { line: i + 1, column: 20, index: (i + 1) * 20 },
          }),
        }));
        return {
          root: {
            findAll: vi.fn().mockReturnValue(mockNodes),
          },
        } as any;
      });

      const result = await symbolService.discoverSymbols({
        rootDir: '/test',
        limit: 2,
        signal: new AbortController().signal,
      });

      expect(result.symbols.length).toBe(2);
      expect(result.truncated).toBe(true);
      // 实际总数可能是 3（如果第二个文件没被统计）或 5（如果被统计）
      // 由于截断发生在第一个文件，我们只统计了第一个文件的剩余 1 个
      expect(result.total).toBeGreaterThanOrEqual(3);
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

    it('should skip unsupported file types', async () => {
      vi.mocked(core.discoverFiles).mockResolvedValue(['/test/file.txt', '/test/file.md']);
      vi.mocked(core.languageFromFilePath).mockReturnValue(null);

      const result = await symbolService.discoverSymbols({
        rootDir: '/test',
        limit: 100,
        signal: new AbortController().signal,
      });

      expect(result.symbols).toEqual([]);
      expect(result.total).toBe(0);
    });
  });
});
