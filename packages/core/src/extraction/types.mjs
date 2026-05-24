/**
 * Shared types for los-ast extraction layer.
 * Ported from UA's types.ts — aligned with los-ast's existing
 * CodeSymbolInfo in packages/shared/src/types/evidence.ts.
 *
 * @typedef {object} FunctionInfo
 * @property {string} name
 * @property {[number, number]} lineRange - [startLine, endLine] 1-indexed
 * @property {string[]} params
 * @property {string} [returnType]
 *
 * @typedef {object} ClassInfo
 * @property {string} name
 * @property {[number, number]} lineRange
 * @property {string[]} methods
 * @property {string[]} properties
 *
 * @typedef {object} ImportInfo
 * @property {string} source - raw import source string
 * @property {string[]} specifiers
 * @property {number} lineNumber - 1-indexed
 *
 * @typedef {object} ExportInfo
 * @property {string} name
 * @property {number} lineNumber - 1-indexed
 * @property {boolean} [isDefault]
 *
 * @typedef {object} StructuralAnalysis
 * @property {FunctionInfo[]} functions
 * @property {ClassInfo[]} classes
 * @property {ImportInfo[]} imports
 * @property {ExportInfo[]} exports
 *
 * @typedef {object} CallGraphEntry
 * @property {string} caller - enclosing function name
 * @property {string} callee - called function text
 * @property {number} lineNumber - 1-indexed
 *
 * @typedef {object} ImportResolution
 * @property {string} source - raw import source
 * @property {string} resolvedPath - project-relative resolved path
 * @property {string[]} specifiers
 *
 * @typedef {(rawImport: string, file: {path: string}, ctx: object) => string[]} ImportResolver
 */

export {}
