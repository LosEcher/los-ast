/**
 * TypeScript / JavaScript import resolver.
 * Ported from UA's extract-import-map.mjs resolveTsJsImport().
 *
 * Handles:
 *   - Relative imports: `./foo` -> `<dir>/foo` + ext probes
 *   - tsconfig path aliases: `@/foo` -> `<baseUrl>/<target>/foo`
 *   - CommonJS require(): `require('./foo')` regex supplement
 */

import {
  findNearestConfigDir,
  probeWithExtensions,
  resolveRelative,
  toPosix,
  dirOf,
} from './resolver-context.mjs'

/**
 * Match an import against a tsconfig paths alias.
 * @param {string} alias
 * @param {string} src
 * @returns {string | null}
 */
function matchTsAlias(alias, src) {
  const starIdx = alias.indexOf('*')
  if (starIdx === -1) {
    return src === alias ? '' : null
  }
  const prefix = alias.slice(0, starIdx)
  const suffix = alias.slice(starIdx + 1)
  if (!src.startsWith(prefix)) return null
  if (!src.endsWith(suffix)) return null
  if (src.length < prefix.length + suffix.length) return null
  return src.slice(prefix.length, src.length - suffix.length)
}

/**
 * Substitute wildcard content into a tsconfig target.
 * @param {string} target
 * @param {string} wildcard
 * @returns {string}
 */
function applyTsAlias(target, wildcard) {
  const starIdx = target.indexOf('*')
  if (starIdx === -1) return target
  return target.slice(0, starIdx) + wildcard + target.slice(starIdx + 1)
}

/**
 * Resolve a TypeScript / JavaScript import to a project-internal path.
 * @param {string} rawImport - raw import source string (no quotes)
 * @param {{ path: string }} file - importer file
 * @param {object} ctx - resolution context from buildResolutionContext()
 * @returns {string | null} resolved project-relative path, or null for external
 */
export function resolveTsJsImport(rawImport, file, ctx) {
  if (!rawImport || typeof rawImport !== 'string') return null
  const src = rawImport.trim()
  if (!src) return null

  const importerDir = dirOf(toPosix(file.path))

  // Relative imports
  if (src.startsWith('./') || src.startsWith('../')) {
    const base = resolveRelative(importerDir, src)
    return probeWithExtensions(base, ctx.fileSet)
  }

  // tsconfig path aliases
  const tsConfigDir = findNearestConfigDir(importerDir, ctx.tsConfigs)
  if (tsConfigDir !== undefined) {
    const tsConfig = ctx.tsConfigs.get(tsConfigDir)
    if (tsConfig) {
      const { baseUrl, paths } = tsConfig
      if (paths && paths.size > 0) {
        for (const [alias, targets] of paths) {
          const aliasMatch = matchTsAlias(alias, src)
          if (aliasMatch === null) continue
          for (const target of targets) {
            const mapped = applyTsAlias(target, aliasMatch)
            const normalizedBase =
              baseUrl === '.' || baseUrl === '' ? '' : toPosix(baseUrl)
            const relativeToConfig = normalizedBase
              ? normalizedBase + '/' + mapped
              : mapped
            const candidate = tsConfigDir
              ? tsConfigDir + '/' + relativeToConfig
              : relativeToConfig
            const probed = probeWithExtensions(candidate, ctx.fileSet)
            if (probed) return probed
          }
        }
      }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// CommonJS require() regex supplement
// ---------------------------------------------------------------------------

const REQUIRE_LITERAL_RE = /\brequire\(\s*(['"])([^'"`\n]+?)\1\s*\)/g

function stripJsLikeComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
}

/**
 * Extract require() source strings from JS content.
 * @param {string} content - file source
 * @returns {string[]}
 */
export function extractRequireSources(content) {
  const sources = []
  let m
  const stripped = stripJsLikeComments(content)
  REQUIRE_LITERAL_RE.lastIndex = 0
  while ((m = REQUIRE_LITERAL_RE.exec(stripped)) !== null) {
    sources.push(m[2])
  }
  return sources
}
