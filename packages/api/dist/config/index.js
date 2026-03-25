import { deriveRuntimeConfig, normalizeAndValidateConfig, } from './shared.js';
export { DEFAULT_SCAN_LIMITS } from './shared.js';
const parsedConfig = normalizeAndValidateConfig(process.env);
export const { NODE_ENV, IS_PRODUCTION, PORT, SCAN_LIMITS, SCOPE_CONFIG, JWT_CONFIG, DEV_ALLOW_UNVERIFIED_IDENTITY, EVIDENCE_CONFIG, PERSISTENCE_CONFIG, PARSER_CONFIG, ROUTE_CONFIG, } = deriveRuntimeConfig(parsedConfig);
export function validateConfig() {
    const result = {
        valid: parsedConfig.errors.length === 0,
        errors: [...parsedConfig.errors],
    };
    const env = parsedConfig.values;
    if (env.ENABLE_INTERNAL_ROUTES && !env.ENABLE_EXPERIMENTAL_ROUTES) {
        console.warn('[WARNING] Internal routes are enabled but experimental routes are disabled. Internal routes typically depend on experimental features.');
    }
    if (!IS_PRODUCTION) {
        if (!SCOPE_CONFIG.requireFullScope) {
            console.log('[INFO] Running in development mode with relaxed scope validation.');
        }
        if (!DEV_ALLOW_UNVERIFIED_IDENTITY) {
            console.log('[INFO] Unverified identity is disabled in development mode.');
        }
        else {
            console.log('[INFO] Unverified identity is enabled in development mode.');
        }
        if (!env.INTERNAL_ROUTES_ALLOW_LOCALHOST) {
            console.log('[INFO] Internal routes localhost access is disabled.');
        }
    }
    if (IS_PRODUCTION && env.ENABLE_EXPERIMENTAL_ROUTES) {
        console.warn('[WARNING] Experimental routes are enabled in production environment. This is not recommended.');
    }
    if (IS_PRODUCTION && env.ENABLE_INTERNAL_ROUTES) {
        console.warn('[WARNING] Internal routes are enabled in production environment. Ensure proper access control is in place.');
    }
    if (IS_PRODUCTION && env.ENABLE_VPS_AGENT_WEB_ROUTES) {
        console.warn('[WARNING] VPS Agent Web routes are enabled in production environment. Verify API gateway policies are in place.');
    }
    return result;
}
export function logStartupConfig() {
    console.log('[STARTUP] ============================================');
    console.log('[STARTUP] Scan limits: ' +
        `maxFiles=${SCAN_LIMITS.maxFilesPerSyncScan} (env), ` +
        `maxBytes=${Math.round(SCAN_LIMITS.maxResponseBytes / 1024 / 1024)}MB (env), ` +
        `maxDuration=${Math.round(SCAN_LIMITS.maxDurationMs / 1000)}s (default)`);
    console.log(`[STARTUP] Environment: ${NODE_ENV}, Full scope required: ${SCOPE_CONFIG.requireFullScope}`);
    console.log('[STARTUP] Identity strategy:');
    console.log(`[STARTUP]   - Enforce JWT: ${JWT_CONFIG.enforceJWT}`);
    console.log(`[STARTUP]   - JWT secret source: ${JWT_CONFIG.secret ? (parsedConfig.values.JWT_SECRET ? 'JWT_SECRET' : 'LSCLAW_JWT_SECRET') : 'unset'}`);
    console.log(`[STARTUP]   - JWT secret configured: ${!!JWT_CONFIG.secret}`);
    console.log(`[STARTUP]   - Dev allow unverified identity: ${DEV_ALLOW_UNVERIFIED_IDENTITY}`);
    console.log(`[STARTUP]   - Evidence signing: ${EVIDENCE_CONFIG.enableSignatures ? 'ENABLED' : 'DISABLED'}`);
    console.log('[STARTUP] Persistence configuration:');
    console.log(`[STARTUP]   - Experimental store backend: ${PERSISTENCE_CONFIG.experimentalStoreBackend}`);
    console.log(`[STARTUP]   - Experimental store dir: ${PERSISTENCE_CONFIG.experimentalStoreDir || '(default)'}`);
    console.log(`[STARTUP]   - Experimental sqlite path: ${PERSISTENCE_CONFIG.experimentalSqlitePath || '(default)'}`);
    console.log('[STARTUP] Parser configuration:');
    console.log(`[STARTUP]   - OpenAPI native parser: ${PARSER_CONFIG.enableOpenApiNativeParser ? 'ENABLED' : 'DISABLED'}`);
    console.log(`[STARTUP]   - Schema native parser: ${PARSER_CONFIG.enableSchemaNativeParser ? 'ENABLED' : 'DISABLED'}`);
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
