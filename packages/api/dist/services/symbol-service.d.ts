import type { SymbolResult } from '@los-ast/shared/types';
export interface SymbolServiceOptions {
    rootDir: string;
    include?: string[];
    ignore?: string[];
    limit?: number;
    signal: AbortSignal;
}
export declare class SymbolService {
    /**
     * 发现代码库中的符号定义
     * 解析文件提取 function, class, interface, variable, type 等符号
     */
    discoverSymbols(options: SymbolServiceOptions): Promise<SymbolResult>;
    /**
     * 从单个文件提取符号
     * 使用简单的正则匹配作为示例实现
     */
    private extractSymbolsFromFile;
}
export declare const symbolService: SymbolService;
//# sourceMappingURL=symbol-service.d.ts.map