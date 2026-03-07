import type { ScanLimits } from '../types/index.js';

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
export const SCAN_LIMITS: ScanLimits = {
  maxFilesPerSyncScan: parseInt(process.env.MAX_FILES_PER_SYNC_SCAN || '1000', 10),
  maxResponseBytes: parseInt(process.env.MAX_RESPONSE_BYTES || '10485760', 10), // 10MB
  maxDurationMs: parseInt(process.env.MAX_SCAN_DURATION_MS || '30000', 10),     // 30s
};

/**
 * Scope 配置 (硬约束 #3)
 */
export const SCOPE_CONFIG = {
  requireFullScope: process.env.REQUIRE_FULL_SCOPE === 'true' || IS_PRODUCTION,
  allowedModes: {
    production: ['service'] as const,
    development: ['local', 'service'] as const,
  },
};

/**
 * 启动时打印生效的配置值
 */
export function logStartupConfig(): void {
  console.log('[STARTUP] Scan limits: ' +
    `maxFiles=${SCAN_LIMITS.maxFilesPerSyncScan} (env), ` +
    `maxBytes=${Math.round(SCAN_LIMITS.maxResponseBytes / 1024 / 1024)}MB (env), ` +
    `maxDuration=${Math.round(SCAN_LIMITS.maxDurationMs / 1000)}s (default)`
  );
  console.log(`[STARTUP] Environment: ${NODE_ENV}, Full scope required: ${SCOPE_CONFIG.requireFullScope}`);
}
