import fs from 'node:fs/promises'

import { parse } from '@ast-grep/napi'

function touchLru(map, key) {
  const value = map.get(key)
  map.delete(key)
  map.set(key, value)
  return value
}

export const DEFAULT_PARSE_CACHE_MAX_ENTRIES = 128

export function createParseCache({ maxEntries = DEFAULT_PARSE_CACHE_MAX_ENTRIES } = {}) {
  const entries = new Map()
  const stats = { hits: 0, misses: 0, evictions: 0 }

  async function parseFile(filePath, language, { cacheAst = true } = {}) {
    const st = await fs.stat(filePath)
    const key = `${String(language)}|${filePath}|${st.mtimeMs}|${st.size}`

    if (entries.has(key)) {
      const entry = touchLru(entries, key)
      stats.hits += 1
      if (cacheAst && entry.root) return { ...entry, key, hit: true }
      const root = parse(language, entry.source).root()
      if (cacheAst) entry.root = root
      return { ...entry, root, key, hit: true }
    }

    const source = await fs.readFile(filePath, 'utf8')
    const root = parse(language, source).root()

    const entry = { filePath, language: String(language), source, root: cacheAst ? root : null }

    entries.set(key, entry)
    stats.misses += 1

    while (entries.size > maxEntries) {
      const oldestKey = entries.keys().next().value
      entries.delete(oldestKey)
      stats.evictions += 1
    }

    return { ...entry, root, key, hit: false }
  }

  function invalidateFile(filePath) {
    for (const key of entries.keys()) {
      if (key.includes(`|${filePath}|`)) entries.delete(key)
    }
  }

  function snapshotStats() {
    return { ...stats, entries: entries.size, maxEntries }
  }

  return {
    parseFile,
    invalidateFile,
    snapshotStats,
  }
}

export const defaultParseCache = createParseCache()
