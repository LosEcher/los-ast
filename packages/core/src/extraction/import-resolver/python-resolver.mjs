/**
 * Python import resolver.
 * Ported from UA's extract-import-map.mjs resolvePythonImport().
 *
 * Handles:
 *   - Relative imports (leading dots) -> walk-up then descend
 *   - Absolute imports -> multi-root walk-up probe
 *   - __init__.py package marker detection
 *   - Submodule specifier probing for `from pkg import a, b`
 */

import { toPosix, dirOf } from './resolver-context.mjs'

/**
 * @param {string[]} moduleParts - e.g. ['src', 'utils']
 * @param {string[] | undefined} specifiers
 * @param {object} ctx
 * @returns {string[]}
 */
function resolvePythonProbe(moduleParts, specifiers, ctx) {
  if (moduleParts.length === 0) return []
  const base = moduleParts.join('/')
  const matches = []

  const moduleFile = `${base}.py`
  const packageInit = `${base}/__init__.py`

  if (ctx.fileSet.has(moduleFile)) {
    matches.push(moduleFile)
    return matches
  }
  if (ctx.fileSet.has(packageInit)) {
    matches.push(packageInit)
    if (Array.isArray(specifiers)) {
      for (const spec of specifiers) {
        if (!spec || spec === '*' || spec.includes('.')) continue
        const subFile = `${base}/${spec}.py`
        const subInit = `${base}/${spec}/__init__.py`
        if (ctx.fileSet.has(subFile)) matches.push(subFile)
        else if (ctx.fileSet.has(subInit)) matches.push(subInit)
      }
    }
    return matches
  }

  return []
}

/**
 * Resolve a Python import to project-internal .py files.
 * @param {string} rawImport - import source (e.g. "os.path", ".utils")
 * @param {string[]} specifiers - named specifiers from `from X import a, b`
 * @param {{ path: string }} file - importer file
 * @param {object} ctx - resolution context
 * @returns {string[]}
 */
export function resolvePythonImport(rawImport, specifiers, file, ctx) {
  if (typeof rawImport !== 'string') return []
  const src = rawImport
  const importerDir = dirOf(toPosix(file.path))

  // Count leading dots
  let dots = 0
  while (dots < src.length && src.charCodeAt(dots) === 0x2e) dots++
  const tail = src.slice(dots)
  const tailSegments = tail ? tail.split('.').filter(Boolean) : []

  if (dots > 0) {
    // Relative import
    const importerParts = importerDir ? importerDir.split('/').filter(Boolean) : []
    const dropLevels = dots - 1
    if (dropLevels > importerParts.length) return []
    const baseParts = importerParts.slice(0, importerParts.length - dropLevels)

    if (tailSegments.length === 0) {
      if (!Array.isArray(specifiers) || specifiers.length === 0) return []
      const base = baseParts.join('/')
      const matches = []
      for (const spec of specifiers) {
        if (!spec || spec === '*' || spec.includes('.')) continue
        const subFile = base ? `${base}/${spec}.py` : `${spec}.py`
        const subInit = base ? `${base}/${spec}/__init__.py` : `${spec}/__init__.py`
        if (ctx.fileSet.has(subFile)) matches.push(subFile)
        else if (ctx.fileSet.has(subInit)) matches.push(subInit)
      }
      return matches
    }

    const moduleParts = baseParts.concat(tailSegments)
    return resolvePythonProbe(moduleParts, specifiers, ctx)
  }

  // Absolute import — walk up from importer, try each ancestor as Python root
  if (tailSegments.length === 0) return []
  const importerParts = importerDir ? importerDir.split('/').filter(Boolean) : []
  for (let i = importerParts.length; i >= 0; i--) {
    const rootParts = importerParts.slice(0, i)
    const candidateModule = rootParts.concat(tailSegments)
    const matches = resolvePythonProbe(candidateModule, specifiers, ctx)
    if (matches.length > 0) return matches
  }
  return []
}
