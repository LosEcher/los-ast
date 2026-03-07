/**
 * API 配置
 * 配置来源优先级：环境变量 > 配置文件 > 代码默认值
 */
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';
export const PORT = parseInt(process.env.PORT || '3000', 10);
/**
 * 扫描限制配置 (硬约束 #4)
 */
export const SCAN_LIMITS = {
    maxFilesPerSyncScan: parseInt(process.env.MAX_FILES_PER_SYNC_SCAN || '1000', 10),
    maxResponseBytes: parseInt(process.env.MAX_RESPONSE_BYTES || '10485760', 10), // 10MB
    maxDurationMs: parseInt(process.env.MAX_SCAN_DURATION_MS || '30000', 10), // 30s
};
/**
 * Scope 配置 (硬约束 #3)
 */
export const SCOPE_CONFIG = {
    requireFullScope: process.env.REQUIRE_FULL_SCOPE === 'true' || IS_PRODUCTION,
    allowedModes: {
        production: ['service'],
        development: ['local', 'service'],
    },
};
/**
 * 路由分层配置
 * 支持核心路由、实验性路由和内部路由的分离
 */
export const ROUTE_CONFIG = {
    /**
     * 是否启用实验性路由
     * 实验性路由挂载在 /experimental/* 下
     */
    enableExperimental: process.env.ENABLE_EXPERIMENTAL_ROUTES === 'true',
    /**
     * 是否启用内部路由
     * 内部路由挂载在 /internal/* 下
     */
    enableInternal: process.env.ENABLE_INTERNAL_ROUTES === 'true',
    /**
     * 路由前缀配置
     */
    prefixes: {
        core: '',
        experimental: '/experimental',
        internal: '/internal',
    },
};
/**
 * 配置验证函数
 * 在服务器启动前验证所有配置项的合法性
 */
export function validateConfig() {
    const errors = [];
    // 验证端口范围
    if (PORT < 1 || PORT > 65535) {
        errors.push(`Invalid PORT: ${PORT}. Must be between 1 and 65535.`);
    }
    // 验证扫描限制合理性
    if (SCAN_LIMITS.maxFilesPerSyncScan < 1) {
        errors.push(`Invalid MAX_FILES_PER_SYNC_SCAN: ${SCAN_LIMITS.maxFilesPerSyncScan}. Must be at least 1.`);
    }
    if (SCAN_LIMITS.maxResponseBytes < 1024) {
        errors.push(`Invalid MAX_RESPONSE_BYTES: ${SCAN_LIMITS.maxResponseBytes}. Must be at least 1024 bytes.`);
    }
    if (SCAN_LIMITS.maxDurationMs < 1000) {
        errors.push(`Invalid MAX_SCAN_DURATION_MS: ${SCAN_LIMITS.maxDurationMs}. Must be at least 1000ms.`);
    }
    // 生产环境警告（如果实验性功能启用）
    if (IS_PRODUCTION && ROUTE_CONFIG.enableExperimental) {
        console.warn('[WARNING] Experimental routes are enabled in production environment. This is not recommended.');
    }
    if (IS_PRODUCTION && ROUTE_CONFIG.enableInternal) {
        console.warn('[WARNING] Internal routes are enabled in production environment. Ensure proper access control is in place.');
    }
    return {
        valid: errors.length === 0,
        errors,
    };
}
/**
 * 启动时打印生效的配置值
 */
export function logStartupConfig() {
    console.log('[STARTUP] ============================================');
    console.log('[STARTUP] Scan limits: ' +
        `maxFiles=${SCAN_LIMITS.maxFilesPerSyncScan} (env), ` +
        `maxBytes=${Math.round(SCAN_LIMITS.maxResponseBytes / 1024 / 1024)}MB (env), ` +
        `maxDuration=${Math.round(SCAN_LIMITS.maxDurationMs / 1000)}s (default)`);
    console.log(`[STARTUP] Environment: ${NODE_ENV}, Full scope required: ${SCOPE_CONFIG.requireFullScope}`);
    // 路由配置输出
    console.log('[STARTUP] Route configuration:');
    console.log(`[STARTUP]   - Experimental routes: ${ROUTE_CONFIG.enableExperimental ? 'ENABLED' : 'DISABLED'}`);
    console.log(`[STARTUP]   - Internal routes: ${ROUTE_CONFIG.enableInternal ? 'ENABLED' : 'DISABLED'}`);
    if (ROUTE_CONFIG.enableExperimental) {
        console.log(`[STARTUP]   - Experimental prefix: ${ROUTE_CONFIG.prefixes.experimental}`);
    }
    if (ROUTE_CONFIG.enableInternal) {
        console.log(`[STARTUP]   - Internal prefix: ${ROUTE_CONFIG.prefixes.internal}`);
    }
    console.log('[STARTUP] ============================================');
}
//# sourceMappingURL=index.js.map