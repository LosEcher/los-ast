/**
 * Schema Artifacts - Shared
 * Re-exports for backward compatibility
 */
// Normalizer
export { normalizeSqlType, isSequenceBackedSqlType, normalizeDefaultValue, } from './normalizer.js';
// Parser
export { inferFormat, parseSqlEntities, parsePrismaEntities, } from './parser.js';
