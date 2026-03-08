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
     * 使用 AST-grep 进行结构化符号提取
     */
    discoverSymbols(options: SymbolServiceOptions): Promise<SymbolResult>;
    /**
     * 从单个文件使用 AST 提取符号
     * 使用 @ast-grep/napi 进行结构化解析
     */
    private extractSymbolsFromFileAST;
}
export declare const symbolService: SymbolService;
//# sourceMappingURL=symbol-service.d.ts.map