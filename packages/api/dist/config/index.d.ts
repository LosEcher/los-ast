import type { ScanLimits } from '../types/index.js';
/**
 * API 配置
 * 配置来源优先级：环境变量 > 配置文件 > 代码默认值
 */
export declare const NODE_ENV: string;
export declare const IS_PRODUCTION: boolean;
export declare const PORT: number;
/**
 * 扫描限制配置 (硬约束 #4)
 */
export declare const SCAN_LIMITS: ScanLimits;
/**
 * Scope 配置 (硬约束 #3)
 */
export declare const SCOPE_CONFIG: {
    requireFullScope: boolean;
    allowedModes: {
        production: readonly ["service"];
        development: readonly ["local", "service"];
    };
};
/**
 * 启动时打印生效的配置值
 */
export declare function logStartupConfig(): void;
//# sourceMappingURL=index.d.ts.map