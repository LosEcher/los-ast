/**
 * Config - Validation
 * Configuration validation logic
 */

import { configSchema } from './schemas.js';
import type { ConfigInput, ParsedConfig, ParsedConfigResult } from './types.js';
import { CONFIG_WITH_DEFAULTS } from './constants.js';

export function resolveNodeEnv(rawNodeEnv: string | undefined): ParsedConfig['NODE_ENV'] {
  return rawNodeEnv === 'production' || rawNodeEnv === 'test' || rawNodeEnv === 'development'
    ? rawNodeEnv
    : 'development';
}

export function normalizeAndValidateConfig(env: NodeJS.ProcessEnv): ParsedConfigResult {
  const rawEnv: ConfigInput = {
    NODE_ENV: env.NODE_ENV,
    PORT: env.PORT,
    MAX_FILES_PER_SYNC_SCAN: env.MAX_FILES_PER_SYNC_SCAN,
    MAX_RESPONSE_BYTES: env.MAX_RESPONSE_BYTES,
    MAX_SCAN_DURATION_MS: env.MAX_SCAN_DURATION_MS,
    REQUIRE_FULL_SCOPE: env.REQUIRE_FULL_SCOPE,
    ENFORCE_JWT: env.ENFORCE_JWT,
    JWT_SECRET: env.JWT_SECRET,
    LSCLAW_JWT_SECRET: env.LSCLAW_JWT_SECRET,
    DEV_ALLOW_UNVERIFIED_IDENTITY: env.DEV_ALLOW_UNVERIFIED_IDENTITY,
    EVIDENCE_SIGNING_KEY: env.EVIDENCE_SIGNING_KEY,
    EXPERIMENTAL_STORE_BACKEND: env.EXPERIMENTAL_STORE_BACKEND,
    EXPERIMENTAL_STORE_DIR: env.EXPERIMENTAL_STORE_DIR,
    EXPERIMENTAL_SQLITE_PATH: env.EXPERIMENTAL_SQLITE_PATH,
    ENABLE_OPENAPI_NATIVE_PARSER: env.ENABLE_OPENAPI_NATIVE_PARSER,
    ENABLE_SCHEMA_NATIVE_PARSER: env.ENABLE_SCHEMA_NATIVE_PARSER,
    ENABLE_EXPERIMENTAL_ROUTES: env.ENABLE_EXPERIMENTAL_ROUTES,
    ENABLE_INTERNAL_ROUTES: env.ENABLE_INTERNAL_ROUTES,
    ENABLE_VPS_AGENT_WEB_ROUTES: env.ENABLE_VPS_AGENT_WEB_ROUTES,
    INTERNAL_ROUTES_ALLOWED_IPS: env.INTERNAL_ROUTES_ALLOWED_IPS,
    INTERNAL_ROUTES_TOKEN: env.INTERNAL_ROUTES_TOKEN,
    INTERNAL_ROUTES_ALLOW_LOCALHOST: env.INTERNAL_ROUTES_ALLOW_LOCALHOST,
    ROUTE_PREFIX_EXPERIMENTAL: env.ROUTE_PREFIX_EXPERIMENTAL,
    ROUTE_PREFIX_INTERNAL: env.ROUTE_PREFIX_INTERNAL,
    ROUTE_PREFIX_VPS_AGENT_WEB: env.ROUTE_PREFIX_VPS_AGENT_WEB,
  };

  const parseResult = configSchema.safeParse(rawEnv);
  const errors: string[] = [];

  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      const name = issue.path.join('.') || 'config';
      errors.push(`Invalid ${name}: ${issue.message}`);
    }

    const fallback = {
      values: CONFIG_WITH_DEFAULTS,
      errors: [...errors],
    };

    if (env.ENFORCE_JWT === 'true' || env.ENFORCE_JWT === '1' || resolveNodeEnv(env.NODE_ENV) === 'production') {
      if (!fallback.values.JWT_SECRET && !fallback.values.LSCLAW_JWT_SECRET) {
        fallback.errors.push('Invalid JWT secret: ENFORCE_JWT requires JWT_SECRET or LSCLAW_JWT_SECRET to be set.');
      }
    }

    return fallback;
  }

  const values = parseResult.data;

  if ((values.ENFORCE_JWT || values.NODE_ENV === 'production') && !values.JWT_SECRET && !values.LSCLAW_JWT_SECRET) {
    errors.push('Invalid JWT secret: ENFORCE_JWT requires JWT_SECRET or LSCLAW_JWT_SECRET to be set.');
  }

  return {
    values,
    errors,
  };
}
