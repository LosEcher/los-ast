/**
 * Schema Artifacts - Shared
 * Re-exports for backward compatibility
 */

// Types
export type {
  ParsedSchemaFormat,
  SchemaField,
  SchemaEntity,
} from './types.js';

// Normalizer
export {
  normalizeSqlType,
  isSequenceBackedSqlType,
  normalizeDefaultValue,
} from './normalizer.js';

// Parser
export {
  inferFormat,
  parseSqlEntities,
  parsePrismaEntities,
} from './parser.js';
