import { z } from 'zod';

import type { ScanLimits } from '../types/index.js';

const NODE_ENVS = ['development', 'production', 'test'] as const;
const EXPERIMENTAL_STORE_BACKENDS = ['memory', 'file', 'sqlite'] as const;

const boolFromEnvSchema = z.preprocess((value) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === '') {
    return undefined;
  }

  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return value;
}, z.boolean({
  message: 'Invalid boolean value. Expected true/false-like value.',
}));

const stringOrUndefined = z.preprocess((value) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}, z.string().optional());

const routePrefixSchema = z.preprocess((value) => {
  if (value === undefined || value === null) {
    return value;
  }

  return typeof value === 'string' ? value.trim() : value;
}, z.string()
  .min(1, { message: 'Route prefix cannot be empty.' })
  .refine((value) => value.startsWith('/'), {
    message: 'Route prefix must start with "/".',
  })
  .refine((value) => !value.includes(' '), {
    message: 'Route prefix must not contain spaces.',
  }));

export const configSchema = z
  .object({
    NODE_ENV: z
      .preprocess((value) => {
        return value === undefined || value === null || typeof value === 'string' ? value : String(value);
      }, z.enum(NODE_ENVS))
      .default('development'),
    PORT: z.coerce
      .number({ message: 'PORT should be a number.' })
      .int('PORT should be an integer.')
      .min(1, { message: 'PORT must be between 1 and 65535.' })
      .max(65535, { message: 'PORT must be between 1 and 65535.' })
      .default(3000),
    MAX_FILES_PER_SYNC_SCAN: z.coerce
      .number({ message: 'MAX_FILES_PER_SYNC_SCAN should be a number.' })
      .int('MAX_FILES_PER_SYNC_SCAN should be an integer.')
      .min(1, { message: 'MAX_FILES_PER_SYNC_SCAN must be at least 1.' })
      .default(1000),
    MAX_RESPONSE_BYTES: z.coerce
      .number({ message: 'MAX_RESPONSE_BYTES should be a number.' })
      .int('MAX_RESPONSE_BYTES should be an integer.')
      .min(1024, { message: 'MAX_RESPONSE_BYTES must be at least 1024 bytes.' })
      .default(10 * 1024 * 1024),
    MAX_SCAN_DURATION_MS: z.coerce
      .number({ message: 'MAX_SCAN_DURATION_MS should be a number.' })
      .int('MAX_SCAN_DURATION_MS should be an integer.')
      .min(1000, { message: 'MAX_SCAN_DURATION_MS must be at least 1000ms.' })
      .default(30000),
    REQUIRE_FULL_SCOPE: boolFromEnvSchema.default(false),
    ENFORCE_JWT: boolFromEnvSchema.default(false),
    JWT_SECRET: stringOrUndefined,
    LSCLAW_JWT_SECRET: stringOrUndefined,
    DEV_ALLOW_UNVERIFIED_IDENTITY: boolFromEnvSchema.default(false),
    EVIDENCE_SIGNING_KEY: stringOrUndefined,
    EXPERIMENTAL_STORE_BACKEND: z
      .preprocess((value) => {
        return value === undefined || value === null || typeof value === 'string' ? value : String(value);
      }, z.enum(EXPERIMENTAL_STORE_BACKENDS))
      .default('memory'),
    EXPERIMENTAL_STORE_DIR: stringOrUndefined,
    EXPERIMENTAL_SQLITE_PATH: stringOrUndefined,
    ENABLE_OPENAPI_NATIVE_PARSER: boolFromEnvSchema.default(true),
    ENABLE_SCHEMA_NATIVE_PARSER: boolFromEnvSchema.default(true),
    ENABLE_EXPERIMENTAL_ROUTES: boolFromEnvSchema.default(false),
    ENABLE_INTERNAL_ROUTES: boolFromEnvSchema.default(false),
    ENABLE_VPS_AGENT_WEB_ROUTES: boolFromEnvSchema.default(false),
    INTERNAL_ROUTES_ALLOWED_IPS: stringOrUndefined,
    INTERNAL_ROUTES_TOKEN: stringOrUndefined,
    INTERNAL_ROUTES_ALLOW_LOCALHOST: boolFromEnvSchema.default(true),
    ROUTE_PREFIX_EXPERIMENTAL: routePrefixSchema.default('/experimental'),
    ROUTE_PREFIX_INTERNAL: routePrefixSchema.default('/internal'),
    ROUTE_PREFIX_VPS_AGENT_WEB: routePrefixSchema.default('/vps-agent-web'),
  })
  .superRefine((values, ctx) => {
    if (values.ENABLE_INTERNAL_ROUTES) {
      const hasAllowedIps = Boolean(values.INTERNAL_ROUTES_ALLOWED_IPS);
      const hasToken = Boolean(values.INTERNAL_ROUTES_TOKEN);

      if (!hasAllowedIps && !hasToken) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ENABLE_INTERNAL_ROUTES'],
          message: 'INTERNAL_ROUTES requires INTERNAL_ROUTES_ALLOWED_IPS or INTERNAL_ROUTES_TOKEN.',
        });
      }

      if (hasAllowedIps) {
        const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
        const entries = values.INTERNAL_ROUTES_ALLOWED_IPS?.split(',') ?? [];
        for (const entry of entries) {
          const trimmed = entry.trim();
          if (trimmed.length > 0 && !ipv4Regex.test(trimmed) && trimmed !== 'localhost') {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['INTERNAL_ROUTES_ALLOWED_IPS'],
              message: `Invalid IP address in INTERNAL_ROUTES_ALLOWED_IPS: "${trimmed}".`,
            });
          }
        }
      }

      if (hasToken && (values.INTERNAL_ROUTES_TOKEN?.length ?? 0) < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['INTERNAL_ROUTES_TOKEN'],
          message: 'INTERNAL_ROUTES_TOKEN should be at least 32 characters for security.',
        });
      }

      if (values.NODE_ENV === 'production' && !hasAllowedIps && !hasToken) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['INTERNAL_ROUTES_ALLOWED_IPS'],
          message: 'Production safety: INTERNAL_ROUTES_ENABLED requires INTERNAL_ROUTES_ALLOWED_IPS or INTERNAL_ROUTES_TOKEN.',
        });
      }
    }
  });

export type ConfigInput = z.input<typeof configSchema>;

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ParsedConfig extends z.output<typeof configSchema> {}

export const CONFIG_WITH_DEFAULTS: ParsedConfig = configSchema.parse({
  PORT: '3000',
  MAX_FILES_PER_SYNC_SCAN: '1000',
  MAX_RESPONSE_BYTES: '10485760',
  MAX_SCAN_DURATION_MS: '30000',
});

export const DEFAULT_SCAN_LIMITS: ScanLimits = {
  maxFilesPerSyncScan: Number(CONFIG_WITH_DEFAULTS.MAX_FILES_PER_SYNC_SCAN),
  maxResponseBytes: Number(CONFIG_WITH_DEFAULTS.MAX_RESPONSE_BYTES),
  maxDurationMs: Number(CONFIG_WITH_DEFAULTS.MAX_SCAN_DURATION_MS),
};

export interface ParsedConfigResult {
  values: ParsedConfig;
  errors: string[];
}

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
