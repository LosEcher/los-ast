/**
 * Go import resolver.
 * Ported from UA's extract-import-map.mjs resolveGoImport().
 *
 * Strips module prefix against nearest go.mod, then maps the remainder
 * to a project directory. Package-level imports expand to all .go files
 * in that directory.
 */

import {
  findNearestConfigDir,
  toPosix,
  dirOf,
} from './resolver-context.mjs'

/**
 * Resolve a Go import to project-internal .go files.
 * @param {string} rawImport - e.g. "github.com/foo/bar/util"
 * @param {{ path: string }} file - importer file
 * @param {object} ctx - resolution context
 * @returns {string[]}
 */
export function resolveGoImport(rawImport, file, ctx) {
  if (!rawImport || typeof rawImport !== 'string') return []
  const src = rawImport.trim()
  if (!src) return []

  const importerPath = toPosix(file.path)
  const importerDir = dirOf(importerPath)

  const nearestModuleDir = findNearestConfigDir(importerDir, ctx.goModules)
  if (nearestModuleDir === undefined) {
    if (!ctx._warnedNoGoModule.has(importerPath)) {
      ctx._warnedNoGoModule.add(importerPath)
    }
    return []
  }

  const moduleName = ctx.goModules.get(nearestModuleDir)

  // Strip module prefix
  let remainder
  if (src === moduleName) {
    remainder = ''
  } else if (src.startsWith(moduleName + '/')) {
    remainder = src.slice(moduleName.length + 1)
  } else {
    return [] // External dependency
  }

  const subDir = toPosix(remainder)
  const targetDir = nearestModuleDir
    ? (subDir ? `${nearestModuleDir}/${subDir}` : nearestModuleDir)
    : subDir
  const files = ctx.goFilesByDir.get(targetDir)
  return files ? [...files] : []
}
