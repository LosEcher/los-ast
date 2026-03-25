import { readFile } from 'node:fs/promises';
import { discoverFiles, isReady, languageFromFilePath, defaultParseCache } from '@los-ast/core';
import { CoreNotReadyError } from '../types/errors.js';
import { SYMBOL_RULES, assertNotAborted, buildSymbolsFromAstMatches, clampSymbolLimit, extractSymbolsFromSourceText, partitionSymbolsByLimit, } from './symbol-service/shared.js';
export class SymbolService {
    /**
     * 发现代码库中的符号定义
     * 使用 AST-grep 进行结构化符号提取
     */
    async discoverSymbols(options) {
        const { rootDir, include, ignore, limit = 100, signal } = options;
        // 验证 Core 是否已初始化
        if (!isReady()) {
            throw new CoreNotReadyError();
        }
        const effectiveLimit = clampSymbolLimit(limit);
        assertNotAborted(signal);
        const files = await discoverFiles({ rootDir, include, ignore });
        assertNotAborted(signal);
        const symbols = [];
        let truncated = false;
        let totalScannedFiles = 0;
        let truncatedFileSymbols = [];
        for (const file of files) {
            assertNotAborted(signal);
            totalScannedFiles++;
            const fileSymbols = await this.extractSymbolsFromFileAST(file);
            const { accepted, overflow, truncated: reachedLimit } = partitionSymbolsByLimit(symbols.length, fileSymbols, effectiveLimit);
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
    async extractSymbolsFromFileAST(file) {
        const symbols = [];
        const language = languageFromFilePath(file);
        if (!language) {
            return symbols;
        }
        const normalizedLanguage = String(language).toLowerCase();
        try {
            const { root } = await defaultParseCache.parseFile(file, language, { cacheAst: true });
            for (const rule of SYMBOL_RULES) {
                if (!rule.languages.includes(normalizedLanguage)) {
                    continue;
                }
                const nodes = root.findAll({ rule: { pattern: rule.pattern } });
                symbols.push(...buildSymbolsFromAstMatches({ matches: nodes, kind: rule.kind, file }));
            }
        }
        catch (error) {
            console.warn(`Failed to parse file ${file}:`, error);
        }
        if (symbols.length > 0) {
            return symbols;
        }
        return this.extractSymbolsFromFileText(file, normalizedLanguage);
    }
    async extractSymbolsFromFileText(file, language) {
        const source = await readFile(file, 'utf-8');
        return extractSymbolsFromSourceText({ source, file, language });
    }
}
// 导出单例实例
export const symbolService = new SymbolService();
