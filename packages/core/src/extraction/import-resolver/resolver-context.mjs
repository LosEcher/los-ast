/**
 * Resolution context builder — caches project configs once so
 * per-file import resolvers don't re-read them.
 * Ported from UA's extract-import-map.mjs buildResolutionContext().
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function toPosix(p) {
  return p.split(/[\\/]/).filter(Boolean).join('/')
}

function dirOf(p) {
  const i = p.lastIndexOf('/')
  return i === -1 ? '' : p.slice(0, i)
}

// ---------------------------------------------------------------------------
// tsconfig loading
// ---------------------------------------------------------------------------

function parseTsConfigText(raw) {
  const stripped = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
  let parsed
  try { parsed = JSON.parse(stripped) } catch { try { parsed = JSON.parse(raw) } catch { return null } }
  const compilerOptions = parsed?.compilerOptions ?? {}
  const baseUrl = compilerOptions.baseUrl ?? '.'
  const paths = new Map()
  if (compilerOptions.paths && typeof compilerOptions.paths === 'object') {
    for (const [alias, targets] of Object.entries(compilerOptions.paths)) {
      if (Array.isArray(targets)) paths.set(alias, targets)
    }
  }
  return { baseUrl, paths }
}

function loadTsConfigs(projectRoot, filePaths) {
  const out = new Map()
  for (const p of filePaths) {
    const posix = toPosix(p)
    const base = posix.includes('/') ? posix.slice(posix.lastIndexOf('/') + 1) : posix
    if (base !== 'tsconfig.json') continue
    const absPath = join(projectRoot, posix)
    if (!existsSync(absPath)) continue
    let raw
    try { raw = readFileSync(absPath, 'utf-8') } catch { continue }
    const parsed = parseTsConfigText(raw)
    if (!parsed) continue
    out.set(dirOf(posix), parsed)
  }
  return out
}

// ---------------------------------------------------------------------------
// go.mod loading
// ---------------------------------------------------------------------------

function loadGoModules(projectRoot, filePaths) {
  const out = new Map()
  for (const p of filePaths) {
    const posix = toPosix(p)
    const base = posix.includes('/') ? posix.slice(posix.lastIndexOf('/') + 1) : posix
    if (base !== 'go.mod') continue
    const absPath = join(projectRoot, posix)
    if (!existsSync(absPath)) continue
    let raw
    try { raw = readFileSync(absPath, 'utf-8') } catch { continue }
    let moduleName = ''
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.replace(/\/\/.*$/, '').trim()
      if (!trimmed.startsWith('module ')) continue
      moduleName = trimmed.slice('module '.length).trim()
      break
    }
    if (!moduleName) continue
    out.set(dirOf(posix), moduleName)
  }
  return out
}

// ---------------------------------------------------------------------------
// Nearest config lookup
// ---------------------------------------------------------------------------

export function findNearestConfigDir(startDir, configMap) {
  if (configMap.size === 0) return undefined
  const parts = startDir ? startDir.split('/').filter(Boolean) : []
  for (let i = parts.length; i >= 0; i--) {
    const ancestor = parts.slice(0, i).join('/')
    if (configMap.has(ancestor)) return ancestor
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Main context builder
// ---------------------------------------------------------------------------

/**
 * Build a resolution context for import resolution.
 * @param {string} projectRoot - absolute project root path
 * @param {string[]} filePaths - all project file paths (project-relative)
 * @returns {object}
 */
export function buildResolutionContext(projectRoot, filePaths) {
  const fileSet = new Set(filePaths.map((p) => toPosix(p)))
  const tsConfigs = loadTsConfigs(projectRoot, filePaths)
  const goModules = loadGoModules(projectRoot, filePaths)

  // Index .go files by directory
  const goFilesByDir = new Map()
  for (const p of filePaths) {
    if (!p.endsWith('.go')) continue
    const posix = toPosix(p)
    const d = dirOf(posix)
    if (!goFilesByDir.has(d)) goFilesByDir.set(d, [])
    goFilesByDir.get(d).push(posix)
  }
  for (const arr of goFilesByDir.values()) {
    arr.sort((a, b) => a.localeCompare(b))
  }

  return {
    projectRoot,
    fileSet,
    tsConfigs,
    goModules,
    goFilesByDir,
    _warnedNoRustCrateRoot: new Set(),
    _warnedNoGoModule: new Set(),
  }
}

// ---------------------------------------------------------------------------
// Shared file probing
// ---------------------------------------------------------------------------

const TS_EXT_PROBES = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '/index.ts', '/index.tsx', '/index.js', '/index.jsx',
]

export function probeWithExtensions(basePath, fileSet) {
  if (!basePath) return null
  if (fileSet.has(basePath)) return basePath
  for (const ext of TS_EXT_PROBES) {
    const candidate = basePath + ext
    if (fileSet.has(candidate)) return candidate
  }
  return null
}

export function resolveRelative(dir, rel) {
  const parts = (dir ? dir.split('/').filter(Boolean) : []).concat(
    rel.split('/').filter(Boolean),
  )
  const stack = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (stack.length === 0) return ''
      stack.pop()
    } else {
      stack.push(part)
    }
  }
  return stack.join('/')
}

export { toPosix, dirOf }
