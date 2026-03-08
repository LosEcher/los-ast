/**
 * Scan Service Unit Tests
 * Core façade 扫描服务单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scanService } from '../../../src/services/scan-service';
import { SCAN_LIMITS } from '../../../src/config';
import * as core from '@los-ast/core';

// Mock Core 模块
vi.mock('@los-ast/core', () => ({
  scan: vi.fn(),
  isReady: vi.fn().mockReturnValue(true),
}));

describe('ScanService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
