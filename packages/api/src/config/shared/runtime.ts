/**
 * Config - Runtime
 * Runtime configuration derivation
 */

import type { ScanLimits } from '../../types/index.js';
import type { ParsedConfigResult } from './types.js';

export function deriveRuntimeConfig(parsedConfig: ParsedConfigResult) {
  const NODE_ENV = parsedConfig.values.NODE_ENV;
  const IS_PRODUCTION = NODE_ENV === 'production';
  const PORT = parsedConfig.values.PORT;

  const SCAN_LIMITS: ScanLimits = {
    maxFilesPerSyncScan: parsedConfig.values.MAX_FILES_PER_SYNC_SCAN,
    maxResponseBytes: parsedConfig.values.MAX_RESPONSE_BYTES,
    maxDurationMs: parsedConfig.values.MAX_SCAN_DURATION_MS,
  };

  const SCOPE_CONFIG = {
    requireFullScope: parsedConfig.values.REQUIRE_FULL_SCOPE || IS_PRODUCTION,
    allowedModes: {
      production: ['service'] as const,
      development: ['local', 'service'] as const,
    },
  };

  const JWT_CONFIG = {
    secret: parsedConfig.values.JWT_SECRET ?? parsedConfig.values.LSCLAW_JWT_SECRET ?? null,
    enforceJWT: IS_PRODUCTION || parsedConfig.values.ENFORCE_JWT,
  };

  const DEV_ALLOW_UNVERIFIED_IDENTITY = IS_PRODUCTION
    ? false
    : parsedConfig.values.DEV_ALLOW_UNVERIFIED_IDENTITY;

  const EVIDENCE_CONFIG = {
    signingKey: parsedConfig.values.EVIDENCE_SIGNING_KEY ?? null,
    enableSignatures: !!parsedConfig.values.EVIDENCE_SIGNING_KEY || IS_PRODUCTION,
  };

  const PERSISTENCE_CONFIG = {
    experimentalStoreBackend: parsedConfig.values.EXPERIMENTAL_STORE_BACKEND,
    experimentalStoreDir: parsedConfig.values.EXPERIMENTAL_STORE_DIR,
    experimentalSqlitePath: parsedConfig.values.EXPERIMENTAL_SQLITE_PATH,
  };

  const PARSER_CONFIG = {
    enableOpenApiNativeParser: parsedConfig.values.ENABLE_OPENAPI_NATIVE_PARSER,
    enableSchemaNativeParser: parsedConfig.values.ENABLE_SCHEMA_NATIVE_PARSER,
  };

  const ROUTE_CONFIG = {
    enableExperimental: parsedConfig.values.ENABLE_EXPERIMENTAL_ROUTES,
    enableInternal: parsedConfig.values.ENABLE_INTERNAL_ROUTES,
    enableVpsAgentWeb: parsedConfig.values.ENABLE_VPS_AGENT_WEB_ROUTES,
    prefixes: {
      core: '',
      experimental: parsedConfig.values.ROUTE_PREFIX_EXPERIMENTAL,
      internal: parsedConfig.values.ROUTE_PREFIX_INTERNAL,
      vpsAgentWeb: parsedConfig.values.ROUTE_PREFIX_VPS_AGENT_WEB,
    },
  };

  return {
    NODE_ENV,
    IS_PRODUCTION,
    PORT,
    SCAN_LIMITS,
    SCOPE_CONFIG,
    JWT_CONFIG,
    DEV_ALLOW_UNVERIFIED_IDENTITY,
    EVIDENCE_CONFIG,
    PERSISTENCE_CONFIG,
    PARSER_CONFIG,
    ROUTE_CONFIG,
  };
}
