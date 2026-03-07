import { discoverFiles, isReady } from '@los-ast/core';
import type { SymbolInfo, SymbolResult } from '@los-ast/shared/types';

export interface SymbolServiceOptions {
  rootDir: string;
  include?: string[];
  ignore?: string[];
  limit?: number;
  signal: AbortSignal;
}

export class SymbolService {
  /**
   * 发现代码库中的符号定义
   * 解析文件提取 function, class, interface, variable, type 等符号
   */
  async discoverSymbols(options: SymbolServiceOptions): Promise<SymbolResult> {
    const { rootDir, include, ignore, limit = 100, signal } = options;

    // 验证 Core 是否已初始化
    if (!isReady()) {
      throw new Error('Core is not ready');
    }

    // 验证 limit 参数
    const effectiveLimit = Math.min(Math.max(1, limit), 1000);

    // 检查取消信号
    if (signal.aborted) {
      throw new Error('Operation aborted');
    }

    // 使用 discoverFiles 获取文件列表
    const files = await discoverFiles({ rootDir, include, ignore });

    // 检查取消信号
    if (signal.aborted) {
      throw new Error('Operation aborted');
    }

    const symbols: SymbolInfo[] = [];
    let truncated = false;

    // 遍历文件提取符号
    for (const file of files) {
      if (signal.aborted) {
        throw new Error('Operation aborted');
      }

      // 简单实现：基于文件扩展名和简单正则提取符号
      const fileSymbols = await this.extractSymbolsFromFile(file);

      for (const symbol of fileSymbols) {
        if (symbols.length >= effectiveLimit) {
          truncated = true;
          break;
        }
        symbols.push(symbol);
      }

      if (truncated) break;
    }

    return {
      symbols,
      total: symbols.length + (truncated ? 1 : 0),
      truncated
    };
  }

  /**
   * 从单个文件提取符号
   * 使用简单的正则匹配作为示例实现
   */
  private async extractSymbolsFromFile(file: string): Promise<SymbolInfo[]> {
    const symbols: SymbolInfo[] = [];
    const fs = await import('node:fs/promises');

    try {
      const content = await fs.readFile(file, 'utf8');
      const lines = content.split('\n');

      // 简单的正则模式匹配
      const patterns = [
        { kind: 'function' as const, regex: /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/g },
        { kind: 'class' as const, regex: /(?:export\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)/g },
        { kind: 'interface' as const, regex: /(?:export\s+)?interface\s+([A-Za-z_$][A-Za-z0-9_$]*)/g },
        { kind: 'type' as const, regex: /(?:export\s+)?type\s+([A-Za-z_$][A-Za-z0-9_$]*)/g },
        { kind: 'variable' as const, regex: /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g },
      ];

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];

        for (const { kind, regex } of patterns) {
          let match;
          while ((match = regex.exec(line)) !== null) {
            symbols.push({
              name: match[1],
              kind,
              file,
              range: {
                start: { line: lineIndex + 1, column: match.index + 1, index: match.index },
                end: { line: lineIndex + 1, column: match.index + match[0].length, index: match.index + match[0].length }
              }
            });
          }
        }
      }
    } catch (error) {
      // 读取失败则跳过该文件
      console.warn(`Failed to read file ${file}:`, error);
    }

    return symbols;
  }
}

// 导出单例实例
export const symbolService = new SymbolService();
