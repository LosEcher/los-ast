import { readFile } from 'node:fs/promises';
import { discoverFiles, isReady, languageFromFilePath, defaultParseCache } from '@los-ast/core';
import type { SymbolInfo, SymbolResult } from '@los-ast/shared/types';
import { CoreNotReadyError } from '../types/errors.js';
import {
  SYMBOL_RULES,
  assertNotAborted,
  buildSymbolsFromAstMatches,
  clampSymbolLimit,
  extractSymbolsFromSourceText,
  partitionSymbolsByLimit,
} from './symbol-service/shared.js';

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
   * 使用 AST-grep 进行结构化符号提取
   */
  async discoverSymbols(options: SymbolServiceOptions): Promise<SymbolResult> {
    const { rootDir, include, ignore, limit = 100, signal } = options;

    // 验证 Core 是否已初始化
    if (!isReady()) {
      throw new CoreNotReadyError();
    }

    const effectiveLimit = clampSymbolLimit(limit);

    assertNotAborted(signal);

    const files = await discoverFiles({ rootDir, include, ignore });

    assertNotAborted(signal);

    const symbols: SymbolInfo[] = [];
    let truncated = false;
    let totalScannedFiles = 0;
    let truncatedFileSymbols: SymbolInfo[] = [];

    for (const file of files) {
      assertNotAborted(signal);
      totalScannedFiles++;
      const fileSymbols = await this.extractSymbolsFromFileAST(file);
      const { accepted, overflow, truncated: reachedLimit } = partitionSymbolsByLimit(
        symbols.length,
        fileSymbols,
        effectiveLimit
      );
      symbols.push(...accepted);

      if (reachedLimit) {
        truncated = true;
        truncatedFileSymbols = overflow;
        break;
      }
    }

    let total = symbols.length;
    if (truncated) {
      total += truncatedFileSymbols.length;
      for (let i = totalScannedFiles; i < files.length; i++) {
        assertNotAborted(signal);
        const file = files[i];
        const fileSymbols = await this.extractSymbolsFromFileAST(file);
        total += fileSymbols.length;
      }
    }

    return {
      symbols,
      total,
      truncated,
    };
  }

  /**
   * 从单个文件使用 AST 提取符号
   * 使用 @ast-grep/napi 进行结构化解析
   */
  private async extractSymbolsFromFileAST(file: string): Promise<SymbolInfo[]> {
    const symbols: SymbolInfo[] = [];

    const language = languageFromFilePath(file);
    if (!language) {
      return symbols;
    }

    const normalizedLanguage = String(language).toLowerCase();

    try {
      const { root } = await defaultParseCache.parseFile(file, language, { cacheAst: true }) as { root: { findAll: (q: unknown) => Array<{ getMatch: (name: string) => { text: () => string } | null; range: () => { start: { line: number; column: number; index: number }; end: { line: number; column: number; index: number } } }> } };

      for (const rule of SYMBOL_RULES) {
        if (!rule.languages.includes(normalizedLanguage)) {
          continue;
        }

        const nodes = root.findAll({ rule: { pattern: rule.pattern } });
        symbols.push(...buildSymbolsFromAstMatches({ matches: nodes, kind: rule.kind, file }));
      }
    } catch (error) {
      console.warn(`Failed to parse file ${file}:`, error);
    }

    if (symbols.length > 0) {
      return symbols;
    }

    return this.extractSymbolsFromFileText(file, normalizedLanguage);
  }

  private async extractSymbolsFromFileText(file: string, language: string): Promise<SymbolInfo[]> {
    const source = await readFile(file, 'utf-8');
    return extractSymbolsFromSourceText({ source, file, language });
  }
}

// 导出单例实例
export const symbolService = new SymbolService();
