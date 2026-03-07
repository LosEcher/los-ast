import { scan, discoverFiles, isReady } from '@los-ast/core';
import { SCAN_LIMITS } from '../config/index.js';
import { ScanTooLargeError } from '../types/errors.js';
import type { ScanResult } from '@los-ast/shared/types';

export interface ScanServiceOptions {
  project: string;
  rootDir: string;
  include?: string[];
  ignore?: string[];
  includeStats?: boolean;
  signal: AbortSignal;
}

export class ScanService {
  /**
   * 预估文件数量
   * 使用 discoverFiles 快速统计匹配文件数
   */
  async estimateFileCount(rootDir: string, include?: string[], ignore?: string[]): Promise<number> {
    try {
      const files = await discoverFiles({ rootDir, include, ignore });
      return files.length;
    } catch (error) {
      // 如果预估失败，返回一个安全值以继续处理
      return 0;
    }
  }

  /**
   * 执行扫描
   * 1. 检查 Core 是否就绪
   * 2. 预估文件数量
   * 3. 检查文件数限制
   * 4. 执行扫描（带超时和取消支持）
   */
  async execute(options: ScanServiceOptions): Promise<ScanResult> {
    const { project, rootDir, include, ignore, includeStats, signal } = options;

    // 检查 Core 是否已初始化
    if (!isReady()) {
      throw new Error('Core is not ready');
    }

    // 预估文件数量
    const estimatedCount = await this.estimateFileCount(rootDir, include, ignore);

    // 检查文件数限制（硬约束 #4）
    if (estimatedCount > SCAN_LIMITS.maxFilesPerSyncScan) {
      throw new ScanTooLargeError(SCAN_LIMITS.maxFilesPerSyncScan, estimatedCount);
    }

    // 检查取消信号
    if (signal.aborted) {
      throw new Error('Scan aborted');
    }

    // 执行扫描
    const result = await scan({
      project,
      rootDir,
      include,
      ignore,
      includeStats,
      signal,
    });

    return result as unknown as ScanResult;
  }
}

// 导出单例实例
export const scanService = new ScanService();
