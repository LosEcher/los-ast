/**
 * Rust import resolver.
 * Ported from UA's extract-import-map.mjs resolveRustImport().
 *
 * Handles:
 *   - crate:: prefix -> src/lib.rs or src/main.rs as crate root
 *   - super:: prefix -> parent directory
 *   - self:: prefix -> same directory
 *   - mod x; declarations (regex supplement)
 */

import {
  toPosix,
  dirOf,
} from './resolver-context.mjs'

/**
 * Probe `<base>.rs` then `<base>/mod.rs` against the file set.
 * @param {string} base
 * @param {Set<string>} fileSet
 * @returns {string | null}
 */
function probeRustModule(base, fileSet) {
  if (!base) return null
  if (fileSet.has(`${base}.rs`)) return `${base}.rs`
  if (fileSet.has(`${base}/mod.rs`)) return `${base}/mod.rs`
  return null
}

/**
 * Find the crate root directory (containing src/lib.rs or src/main.rs).
 * @param {string} importerDir - project-relative dir
 * @param {Set<string>} fileSet
 * @returns {string | null}
 */
function findRustCrateSrc(importerDir, fileSet) {
  const parts = importerDir.split('/').filter(Boolean)
  for (let i = parts.length; i >= 0; i--) {
    const ancestor = parts.slice(0, i).join('/')
    const childSrc = ancestor ? `${ancestor}/src` : 'src'
    if (fileSet.has(`${childSrc}/lib.rs`) || fileSet.has(`${childSrc}/main.rs`)) {
      return childSrc
    }
  }
  return null
}

/**
 * Resolve a Rust use import to project-internal paths.
 * @param {string} rawImport - raw use source (e.g. "crate::a::b::Item")
 * @param {{ path: string }} file - importer file
 * @param {object} ctx - resolution context
 * @returns {string[]}
 */
export function resolveRustImport(rawImport, file, ctx) {
  if (!rawImport || typeof rawImport !== 'string') return []
  const src = rawImport.trim()
  if (!src) return []

  const importerDir = dirOf(toPosix(file.path))
  const segments = src.split('::').filter(Boolean)
  if (segments.length === 0) return []
  const head = segments[0]

  if (head !== 'crate' && head !== 'super' && head !== 'self') return []

  let baseDir
  if (head === 'crate') {
    const crateSrc = findRustCrateSrc(importerDir, ctx.fileSet)
    if (!crateSrc) {
      const importerPath = toPosix(file.path)
      if (!ctx._warnedNoRustCrateRoot.has(importerPath)) {
        ctx._warnedNoRustCrateRoot.add(importerPath)
      }
      return []
    }
    baseDir = crateSrc
  } else if (head === 'super') {
    const parts = importerDir.split('/').filter(Boolean)
    if (parts.length === 0) return []
    baseDir = parts.slice(0, -1).join('/')
  } else {
    baseDir = importerDir
  }

  const rest = segments.slice(1)
  for (let i = rest.length; i > 0; i--) {
    const prefix = rest.slice(0, i)
    const base = baseDir
      ? `${baseDir}/${prefix.join('/')}`
      : prefix.join('/')
    const match = probeRustModule(base, ctx.fileSet)
    if (match) return [match]
  }
  return []
}

// ---------------------------------------------------------------------------
// mod x; regex supplement
// ---------------------------------------------------------------------------

const RUST_MOD_RE = /^\s*(?:pub(?:\s*\([^)]*\))?\s+)?mod\s+(\w+)\s*;\s*$/gm

function stripJsLikeComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
}

/**
 * Extract `mod x;` declarations from Rust source.
 * @param {string} content
 * @returns {string[]} synthesized as `self::<name>` sources
 */
export function extractRustModSources(content) {
  const sources = []
  let m
  const stripped = stripJsLikeComments(content)
  RUST_MOD_RE.lastIndex = 0
  while ((m = RUST_MOD_RE.exec(stripped)) !== null) {
    sources.push(`self::${m[1]}`)
  }
  return sources
}
