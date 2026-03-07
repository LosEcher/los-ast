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
 * 路由分层配置
 * 支持核心路由、实验性路由和内部路由的分离
 */
export declare const ROUTE_CONFIG: {
    /**
     * 是否启用实验性路由
     * 实验性路由挂载在 /experimental/* 下
     */
    enableExperimental: boolean;
    /**
     * 是否启用内部路由
     * 内部路由挂载在 /internal/* 下
     */
    enableInternal: boolean;
    /**
     * 路由前缀配置
     */
    prefixes: {
        core: string;
        experimental: string;
        internal: string;
    };
};
/**
 * 配置验证函数
 * 在服务器启动前验证所有配置项的合法性
 */
export declare function validateConfig(): {
    valid: boolean;
    errors: string[];
};
/**
 * 启动时打印生效的配置值
 */
export declare function logStartupConfig(): void;
//# sourceMappingURL=index.d.ts.map