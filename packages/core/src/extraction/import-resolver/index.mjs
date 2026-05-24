/**
 * Import resolver dispatcher — routes imports to language-specific resolvers.
 */

import { resolveTsJsImport, extractRequireSources } from './ts-js-resolver.mjs'
import { resolveRustImport, extractRustModSources } from './rust-resolver.mjs'
import { resolveGoImport } from './go-resolver.mjs'
import { resolvePythonImport } from './python-resolver.mjs'
import { buildResolutionContext } from './resolver-context.mjs'

export { buildResolutionContext }

const TS_JS_LANGS = new Set([
  'typescript', 'javascript', 'tsx', 'jsx',
])

/**
 * Resolve a raw import to project-internal file paths.
 * @param {{ source: string, specifiers: string[] }} imp
 * @param {{ path: string, language: string }} file
 * @param {object} ctx - resolution context
 * @returns {string[]} resolved project-relative paths (empty = external)
 */
export function resolveImport(imp, file, ctx) {
  const lang = file.language
  const src = imp.source

  if (TS_JS_LANGS.has(lang)) {
    const out = resolveTsJsImport(src, file, ctx)
    return out ? [out] : []
  }
  if (lang === 'python') {
    return resolvePythonImport(src, imp.specifiers, file, ctx)
  }
  if (lang === 'go') {
    return resolveGoImport(src, file, ctx)
  }
  if (lang === 'rust') {
    return resolveRustImport(src, file, ctx)
  }
  return []
}

/**
 * Collect supplemental import sources that tree-sitter extractors don't capture.
 * @param {{ path: string, language: string }} file
 * @param {string} content - file source
 * @returns {string[]}
 */
export function extractExtraImportSources(file, content) {
  if (TS_JS_LANGS.has(file.language)) {
    return extractRequireSources(content)
  }
  if (file.language === 'rust') {
    return extractRustModSources(content)
  }
  return []
}
