import type { ScanResult } from '@los-ast/shared/types';
export interface ScanServiceOptions {
    project: string;
    rootDir: string;
    include?: string[];
    ignore?: string[];
    includeStats?: boolean;
    signal: AbortSignal;
}
export declare class ScanService {
    /**
     * 预估文件数量
     * 使用 discoverFiles 快速统计匹配文件数
     */
    estimateFileCount(rootDir: string, include?: string[], ignore?: string[]): Promise<number>;
    /**
     * 执行扫描
     * 1. 检查 Core 是否就绪
     * 2. 预估文件数量
     * 3. 检查文件数限制
     * 4. 执行扫描（带超时和取消支持）
     */
    execute(options: ScanServiceOptions): Promise<ScanResult>;
}
export declare const scanService: ScanService;
//# sourceMappingURL=scan-service.d.ts.map