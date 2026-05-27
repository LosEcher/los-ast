/**
 * Config - Shared
 * Re-exports for backward compatibility
 *
 * Phase 2 Refactor: Split from monolithic shared.ts into modules:
 * - schemas.ts: Zod schema definitions
 * - types.ts: TypeScript type definitions
 * - constants.ts: Default configuration values
 * - validation.ts: Configuration validation logic
 * - runtime.ts: Runtime configuration derivation
 */
// Schemas
export { boolFromEnvSchema, stringOrUndefined, routePrefixSchema, configSchema, } from './schemas.js';
// Constants
export { CONFIG_WITH_DEFAULTS, DEFAULT_SCAN_LIMITS, CHUNK_CONFIG } from './constants.js';
// Validation
export { resolveNodeEnv, normalizeAndValidateConfig, } from './validation.js';
// Runtime
export { deriveRuntimeConfig } from './runtime.js';
