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

  enableVpsAgentWeb: process.env.ENABLE_VPS_AGENT_WEB_ROUTES === 'true',

  /**
   * 路由前缀配置
   */
  prefixes: {
    core: '',
    experimental: '/experimental',
    internal: '/internal',
    vpsAgentWeb: '/vps-agent-web',
  },
};

/**
 * 有效的 NODE_ENV 值
 */
const VALID_NODE_ENVS = ['development', 'production', 'test'] as const;

/**
 * 验证路由前缀格式
 */
function validateRoutePrefix(prefix: string, name: string, errors: string[]): void {
  if (prefix && !prefix.startsWith('/')) {
    errors.push(`Invalid ${name} prefix: "${prefix}". Must start with "/".`);
  }
  if (prefix.includes(' ')) {
    errors.push(`Invalid ${name} prefix: "${prefix}". Must not contain spaces.`);
  }
}

/**
 * 验证字符串枚举值
 */
function validateEnum(value: string, validValues: readonly string[], name: string, errors: string[]): void {
  if (!validValues.includes(value)) {
    errors.push(`Invalid ${name}: "${value}". Must be one of: ${validValues.join(', ')}.`);
  }
}

/**
 * 验证内部访问控制配置
 */
function validateInternalAccessConfig(errors: string[]): void {
  if (!ROUTE_CONFIG.enableInternal) {
    return;
  }

  const allowedIps = process.env.INTERNAL_ROUTES_ALLOWED_IPS;
  const token = process.env.INTERNAL_ROUTES_TOKEN;
  const allowLocalhost = process.env.INTERNAL_ROUTES_ALLOW_LOCALHOST !== 'false';

  // 生产环境必须配置访问控制
  if (IS_PRODUCTION) {
    if (!allowedIps && !token) {
      errors.push(
        'Production safety: INTERNAL_ROUTES_ENABLED=true requires either ' +
        'INTERNAL_ROUTES_ALLOWED_IPS or INTERNAL_ROUTES_TOKEN to be set.'
      );
    }
  }

  // 验证 IP 格式
  if (allowedIps) {
    const ipList = allowedIps.split(',').map(ip => ip.trim());
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    for (const ip of ipList) {
      if (!ipv4Regex.test(ip) && ip !== 'localhost') {
        errors.push(`Invalid IP address in INTERNAL_ROUTES_ALLOWED_IPS: "${ip}".`);
      }
    }
  }

  // 验证 Token 长度（如果设置了）
  if (token && token.length < 32) {
    errors.push('INTERNAL_ROUTES_TOKEN should be at least 32 characters for security.');
  }

  // 记录 localhost 配置（用于调试）
  if (!allowLocalhost) {
    console.log('[INFO] Internal routes localhost access is disabled.');
  }
}

/**
 * 验证环境变量组合
 */
function validateEnvironmentCombinations(): void {
  // 如果启用了内部路由但没有实验性路由，给出警告
  if (ROUTE_CONFIG.enableInternal && !ROUTE_CONFIG.enableExperimental) {
    console.warn('[WARNING] Internal routes are enabled but experimental routes are disabled. ' +
      'Internal routes typically depend on experimental features.');
  }

  // 开发环境检查
  if (!IS_PRODUCTION) {
    // 开发环境允许宽松配置，但给出提示
    if (!SCOPE_CONFIG.requireFullScope) {
      console.log('[INFO] Running in development mode with relaxed scope validation.');
    }
  }
}

/**
 * 配置验证函数
 * 在服务器启动前验证所有配置项的合法性
 */
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 1. 验证端口范围
  if (PORT < 1 || PORT > 65535) {
    errors.push(`Invalid PORT: ${PORT}. Must be between 1 and 65535.`);
  }

  // 2. 验证扫描限制合理性
  if (SCAN_LIMITS.maxFilesPerSyncScan < 1) {
    errors.push(`Invalid MAX_FILES_PER_SYNC_SCAN: ${SCAN_LIMITS.maxFilesPerSyncScan}. Must be at least 1.`);
  }
  if (SCAN_LIMITS.maxResponseBytes < 1024) {
    errors.push(`Invalid MAX_RESPONSE_BYTES: ${SCAN_LIMITS.maxResponseBytes}. Must be at least 1024 bytes.`);
  }
  if (SCAN_LIMITS.maxDurationMs < 1000) {
    errors.push(`Invalid MAX_SCAN_DURATION_MS: ${SCAN_LIMITS.maxDurationMs}. Must be at least 1000ms.`);
  }

  // 3. 验证路由前缀格式
  validateRoutePrefix(ROUTE_CONFIG.prefixes.experimental, 'Experimental route', errors);
  validateRoutePrefix(ROUTE_CONFIG.prefixes.internal, 'Internal route', errors);
  validateRoutePrefix(ROUTE_CONFIG.prefixes.vpsAgentWeb, 'VPS Agent Web route', errors);

  // 4. 验证 NODE_ENV 枚举值
  validateEnum(NODE_ENV, VALID_NODE_ENVS, 'NODE_ENV', errors);

  // 5. 验证内部访问控制配置
  validateInternalAccessConfig(errors);

  // 6. 验证环境变量组合
  validateEnvironmentCombinations();

  // 7. 生产环境警告（如果实验性功能启用）
  if (IS_PRODUCTION && ROUTE_CONFIG.enableExperimental) {
    console.warn('[WARNING] Experimental routes are enabled in production environment. This is not recommended.');
  }
  if (IS_PRODUCTION && ROUTE_CONFIG.enableInternal) {
    console.warn('[WARNING] Internal routes are enabled in production environment. Ensure proper access control is in place.');
  }
  if (IS_PRODUCTION && ROUTE_CONFIG.enableVpsAgentWeb) {
    console.warn('[WARNING] VPS Agent Web routes are enabled in production environment. Verify API gateway policies are in place.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 启动时打印生效的配置值
 */
export function logStartupConfig(): void {
  console.log('[STARTUP] ============================================');
  console.log('[STARTUP] Scan limits: ' +
    `maxFiles=${SCAN_LIMITS.maxFilesPerSyncScan} (env), ` +
    `maxBytes=${Math.round(SCAN_LIMITS.maxResponseBytes / 1024 / 1024)}MB (env), ` +
    `maxDuration=${Math.round(SCAN_LIMITS.maxDurationMs / 1000)}s (default)`
  );
  console.log(`[STARTUP] Environment: ${NODE_ENV}, Full scope required: ${SCOPE_CONFIG.requireFullScope}`);

  // 路由配置输出
  console.log('[STARTUP] Route configuration:');
  console.log(`[STARTUP]   - Experimental routes: ${ROUTE_CONFIG.enableExperimental ? 'ENABLED' : 'DISABLED'}`);
  console.log(`[STARTUP]   - Internal routes: ${ROUTE_CONFIG.enableInternal ? 'ENABLED' : 'DISABLED'}`);
  console.log(`[STARTUP]   - VPS Agent Web routes: ${ROUTE_CONFIG.enableVpsAgentWeb ? 'ENABLED' : 'DISABLED'}`);
  if (ROUTE_CONFIG.enableExperimental) {
    console.log(`[STARTUP]   - Experimental prefix: ${ROUTE_CONFIG.prefixes.experimental}`);
  }
  if (ROUTE_CONFIG.enableInternal) {
    console.log(`[STARTUP]   - Internal prefix: ${ROUTE_CONFIG.prefixes.internal}`);
  }
  if (ROUTE_CONFIG.enableVpsAgentWeb) {
    console.log(`[STARTUP]   - VPS Agent Web prefix: ${ROUTE_CONFIG.prefixes.vpsAgentWeb}`);
  }
  console.log('[STARTUP] ============================================');
}
