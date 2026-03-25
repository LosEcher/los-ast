import path from 'node:path'

export function extractRoutePrefixDefaults(source) {
  const results = {}
  const routePrefixRegex = /ROUTE_PREFIX_(EXPERIMENTAL|INTERNAL|VPS_AGENT_WEB)\s*:\s*routePrefixSchema\.default\((`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\)/gm

  let match
  while ((match = routePrefixRegex.exec(source)) !== null) {
    const key = String(match[1] || '').trim().toLowerCase()
    const normalizedKey = key === 'vps_agent_web'
      ? 'vpsAgentWeb'
      : key.toLowerCase()
    results[normalizedKey] = parseStaticLiteral(String(match[2] || '').trim())
  }

  return results
}

export function parseStaticLiteral(expression) {
  const trimmed = String(expression || '').trim()
  if (!trimmed) return null

  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
    || (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1)
  }

  if (trimmed.startsWith('`') && trimmed.endsWith('`') && !trimmed.includes('${')) {
    return trimmed.slice(1, -1)
  }

  return null
}

export function resolveStaticExpression(expression, info, moduleInfos, availableFiles, cache = new Map()) {
  const trimmed = String(expression || '').trim()
  if (!trimmed) return null
  if (cache.has(trimmed)) return cache.get(trimmed)

  const literalValue = parseStaticLiteral(trimmed)
  if (literalValue !== null) {
    cache.set(trimmed, literalValue)
    return literalValue
  }

  if (trimmed.startsWith('`') && trimmed.endsWith('`')) {
    const inner = trimmed.slice(1, -1)
    const resolved = inner.replace(/\$\{([^}]+)\}/g, (_, expr) => {
      const value = resolveStaticExpression(expr, info, moduleInfos, availableFiles, cache)
      return value === null ? '__UNRESOLVED__' : value
    })
    if (resolved.includes('__UNRESOLVED__')) {
      cache.set(trimmed, null)
      return null
    }
    cache.set(trimmed, resolved)
    return resolved
  }

  const binding = info.constBindings.find((item) => item.name === trimmed)
  if (binding) {
    const value = resolveStaticExpression(binding.expression, info, moduleInfos, availableFiles, cache)
    cache.set(trimmed, value)
    return value
  }

  const memberMatch = /^([A-Za-z_$][\w$]*)\.prefixes\.(experimental|internal|vpsAgentWeb)$/.exec(trimmed)
  if (memberMatch) {
    const importedIdentifier = memberMatch[1]
    const prefixKey = memberMatch[2]
    const importEntry = info.imports.find((item) => item.localName === importedIdentifier)
    if (!importEntry) {
      cache.set(trimmed, null)
      return null
    }

    const targetFile = resolveLocalModule(info.file.path, importEntry.specifier, availableFiles)
    const targetInfo = targetFile ? moduleInfos.get(targetFile) : null
    const value = targetInfo?.routePrefixDefaults?.[prefixKey] || null
    cache.set(trimmed, value)
    return value
  }

  cache.set(trimmed, null)
  return null
}

export function resolveLocalModule(fromFile, specifier, availableFiles) {
  if (!specifier || !specifier.startsWith('.')) return null

  const fromDir = path.posix.dirname(String(fromFile).split(path.sep).join('/'))
  const base = path.posix.normalize(path.posix.join(fromDir, specifier))
  const extensionlessBase = base.replace(/\.(?:[cm]?js|jsx|tsx?|mts|cts)$/i, '')
  const candidates = [
    base,
    extensionlessBase,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${extensionlessBase}.ts`,
    `${extensionlessBase}.tsx`,
    `${extensionlessBase}.js`,
    `${extensionlessBase}.jsx`,
    `${extensionlessBase}.mjs`,
    `${extensionlessBase}.cjs`,
    path.posix.join(base, 'index.ts'),
    path.posix.join(base, 'index.tsx'),
    path.posix.join(base, 'index.js'),
    path.posix.join(base, 'index.jsx'),
    path.posix.join(base, 'index.mjs'),
    path.posix.join(base, 'index.cjs'),
    path.posix.join(extensionlessBase, 'index.ts'),
    path.posix.join(extensionlessBase, 'index.tsx'),
    path.posix.join(extensionlessBase, 'index.js'),
    path.posix.join(extensionlessBase, 'index.jsx'),
    path.posix.join(extensionlessBase, 'index.mjs'),
    path.posix.join(extensionlessBase, 'index.cjs'),
  ]

  return candidates
    .map((candidate) => candidate.replace(/\/{2,}/g, '/'))
    .find((candidate) => availableFiles.has(candidate)) || null
}

export function resolveExportedModule(moduleFile, exportName, moduleInfos, availableFiles, seen = new Set()) {
  const visitKey = `${moduleFile}:${exportName}`
  if (seen.has(visitKey)) return null
  seen.add(visitKey)

  const info = moduleInfos.get(moduleFile)
  if (!info) return null

  const reexport = info.reexports.find((item) => item.exportName === exportName)
  if (!reexport) return moduleFile

  const nextFile = resolveLocalModule(moduleFile, reexport.source, availableFiles)
  if (!nextFile) return null
  if (reexport.exportKind === 'default') return nextFile
  return resolveExportedModule(nextFile, exportName, moduleInfos, availableFiles, seen) || nextFile
}

export function resolveImportedModule(info, symbol, moduleInfos, availableFiles) {
  const importEntry = info.imports.find((item) => item.localName === symbol)
  if (!importEntry) return null

  const targetFile = resolveLocalModule(info.file.path, importEntry.specifier, availableFiles)
  if (!targetFile) return null
  if (importEntry.importKind === 'default') return targetFile

  return resolveExportedModule(targetFile, importEntry.importedName, moduleInfos, availableFiles) || targetFile
}
