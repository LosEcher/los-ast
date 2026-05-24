/**
 * Extractor registry — maps language IDs to extractors.
 * Supports los-ast's language naming conventions.
 */

import { TypeScriptExtractor } from './extractors/typescript-extractor.mjs'
import { PythonExtractor } from './extractors/python-extractor.mjs'
import { GoExtractor } from './extractors/go-extractor.mjs'
import { RustExtractor } from './extractors/rust-extractor.mjs'

/**
 * @typedef {object} LanguageExtractor
 * @property {string[]} languageIds
 * @property {(rootNode: import('../ast-adapter.mjs').AstNodeAdapter) => import('./types.mjs').StructuralAnalysis} extractStructure
 * @property {(rootNode: import('../ast-adapter.mjs').AstNodeAdapter) => import('./types.mjs').CallGraphEntry[]} extractCallGraph
 */

/** @type {Map<string, LanguageExtractor>} */
const registry = new Map()

/** @type {LanguageExtractor[]} */
const builtinExtractors = [
  new TypeScriptExtractor(),
  new PythonExtractor(),
  new GoExtractor(),
  new RustExtractor(),
]

for (const extractor of builtinExtractors) {
  for (const id of extractor.languageIds) {
    registry.set(id, extractor)
  }
}

/**
 * Get the extractor for a language ID.
 * @param {string} language - los-ast language (TypeScript, JavaScript, Tsx, etc.)
 * @returns {LanguageExtractor | undefined}
 */
export function getExtractor(language) {
  const normalized = String(language).toLowerCase()
  return registry.get(normalized)
}

/**
 * Register a custom extractor. Overwrites existing entries for the same language IDs.
 * @param {LanguageExtractor} extractor
 */
export function registerExtractor(extractor) {
  for (const id of extractor.languageIds) {
    registry.set(id, extractor)
  }
}

/**
 * List all language IDs with registered extractors.
 * @returns {string[]}
 */
export function listExtractableLanguages() {
  return [...registry.keys()].sort()
}
