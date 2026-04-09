/**
 * Config - Schemas
 * Zod schema definitions for environment configuration
 */

import { z } from 'zod';

const NODE_ENVS = ['development', 'production', 'test'] as const;
const EXPERIMENTAL_STORE_BACKENDS = ['memory', 'file', 'sqlite'] as const;

export const boolFromEnvSchema = z.preprocess((value) => {
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

export const stringOrUndefined = z.preprocess((value) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}, z.string().optional());

export const routePrefixSchema = z.preprocess((value) => {
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
