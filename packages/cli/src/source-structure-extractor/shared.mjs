export {
  ROUTE_BINDS_LIMITATION_NOTE,
  buildRouteEvidence,
  classifyFileRole,
  classifyRouteActivation,
  classifyRouteTier,
  inferRouteSourceTier,
  normalizeRoutePath,
  toPosixRelative,
} from './classification.mjs'

export {
  TEXT_IMPORT_PATTERNS,
  TEXT_SYMBOL_PATTERNS,
  extractConstBindings,
  extractDeclaredRoutes,
  extractDetailedImports,
  extractDetailedReexports,
  extractWithPatterns,
  indexToLine,
} from './parsing.mjs'

export {
  extractRoutePrefixDefaults,
  parseStaticLiteral,
  resolveExportedModule,
  resolveImportedModule,
  resolveLocalModule,
  resolveStaticExpression,
} from './resolution.mjs'
