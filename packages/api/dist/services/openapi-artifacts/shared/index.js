/**
 * OpenAPI Artifacts - Shared
 * Re-exports for backward compatibility
 *
 * Phase 2 Refactor: Split from monolithic shared.ts into modules:
 * - types.ts: Type definitions and constants
 * - utils.ts: Utility functions (isRecord, hasEffectiveSecurity, etc.)
 * - parser.ts: Document parsing and validation
 * - operations.ts: Operation extraction from OpenAPI
 * - schemas.ts: Schema resolution and comparison
 */
// Constants
export { HTTP_METHODS, MUTATING_METHODS } from './types.js';
// Utils
export { isRecord, hasEffectiveSecurity, getSchemaObject, decodeJsonPointerSegment, getLeadingSpaceCount, matchesStructuredKey, parseOperationLabel, } from './utils.js';
// Parser
export { parseDocument, ensureOpenApiShape, resolveOperationLine, } from './parser.js';
// Operations
export { getOperations, getRequestSchema, getSuccessResponseSchemas, } from './operations.js';
// Schema Resolver (reference resolution)
export { resolveLocalSchemaRef, resolveObjectSchema, } from './schema-resolver.js';
// Schema Comparator (comparison and field collection)
export { getComparableObjectShape, buildDiscriminatorExcerpt, } from './schema-comparator.js';
// Discriminator Comparator (request/response discriminator finding generation)
export { buildRequestDiscriminatorFindings, buildResponseDiscriminatorFindings, } from './discriminator-comparator.js';
// Legacy schemas export (for backward compatibility)
export * from './schema-resolver.js';
export * from './schema-comparator.js';
