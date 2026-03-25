export const TEXT_SYMBOL_PATTERNS = [
  { kind: 'function', languages: ['typescript', 'javascript', 'tsx', 'jsx'], regex: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm },
  { kind: 'function', languages: ['typescript', 'javascript', 'tsx', 'jsx'], regex: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/gm },
  { kind: 'class', languages: ['typescript', 'javascript', 'tsx', 'jsx'], regex: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)\b/gm },
  { kind: 'interface', languages: ['typescript', 'tsx'], regex: /^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)\b/gm },
  { kind: 'type', languages: ['typescript', 'tsx'], regex: /^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\b/gm },
  { kind: 'variable', languages: ['typescript', 'javascript', 'tsx', 'jsx'], regex: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm },
  { kind: 'function', languages: ['rust'], regex: /^\s*(?:pub\s+)?fn\s+([A-Za-z_][\w]*)\s*\(/gm },
  { kind: 'class', languages: ['rust'], regex: /^\s*(?:pub\s+)?struct\s+([A-Za-z_][\w]*)\b/gm },
  { kind: 'interface', languages: ['rust'], regex: /^\s*(?:pub\s+)?trait\s+([A-Za-z_][\w]*)\b/gm },
  { kind: 'type', languages: ['rust'], regex: /^\s*(?:pub\s+)?type\s+([A-Za-z_][\w]*)\b/gm },
]

export const TEXT_IMPORT_PATTERNS = [
  { kind: 'import', languages: ['typescript', 'javascript', 'tsx', 'jsx'], regex: /^\s*import(?:\s+type)?[\s\S]*?from\s+['"]([^'"]+)['"]/gm },
  { kind: 'import', languages: ['typescript', 'javascript', 'tsx', 'jsx'], regex: /^\s*import\s+['"]([^'"]+)['"]/gm },
  { kind: 'require', languages: ['typescript', 'javascript', 'tsx', 'jsx'], regex: /\brequire\(\s*['"]([^'"]+)['"]\s*\)/gm },
  { kind: 'use', languages: ['rust'], regex: /^\s*use\s+([^;]+);/gm },
]

const ROUTE_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'all']
const STATIC_STRING_TOKEN = "(?:\"([^\"\\r\\n]*)\"|'([^'\\r\\n]*)'|`([^`$\\r\\n]*)`)"

function readStaticStringMatch(match, startIndex = 1) {
  for (let offset = 0; offset < 3; offset += 1) {
    const value = match[startIndex + offset]
    if (value !== undefined) {
      return value
    }
  }
  return ''
}

function parseNamedSpecifiers(segment) {
  return String(segment || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const cleaned = part.replace(/^type\s+/, '').trim()
      const [importedName, localName] = cleaned.split(/\s+as\s+/).map((value) => value.trim()).filter(Boolean)
      return {
        importedName: importedName || cleaned,
        localName: localName || importedName || cleaned,
        importKind: 'named',
      }
    })
}

export function extractDetailedImports(source) {
  const results = []
  const importRegex = /^\s*import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/gm

  let match
  while ((match = importRegex.exec(source)) !== null) {
    const clause = String(match[1] || '').trim()
    const specifier = String(match[2] || '').trim()
    const line = indexToLine(source, match.index)
    const normalizedClause = clause.replace(/^type\s+/, '').trim()

    if (!normalizedClause) continue

    if (normalizedClause.startsWith('{')) {
      for (const item of parseNamedSpecifiers(normalizedClause.slice(1, -1))) {
        results.push({ ...item, specifier, line })
      }
      continue
    }

    if (normalizedClause.includes('{')) {
      const braceIndex = normalizedClause.indexOf('{')
      const defaultSegment = normalizedClause.slice(0, braceIndex).replace(/,\s*$/, '').trim()
      const namedSegment = normalizedClause.slice(braceIndex + 1, normalizedClause.lastIndexOf('}'))

      if (defaultSegment) {
        results.push({
          importedName: 'default',
          localName: defaultSegment,
          importKind: 'default',
          specifier,
          line,
        })
      }

      for (const item of parseNamedSpecifiers(namedSegment)) {
        results.push({ ...item, specifier, line })
      }
      continue
    }

    results.push({
      importedName: 'default',
      localName: normalizedClause,
      importKind: 'default',
      specifier,
      line,
    })
  }

  return results
}

export function extractDetailedReexports(source) {
  const results = []
  const reexportRegex = /^\s*export\s+\{\s*default\s+as\s+([A-Za-z_$][\w$]*)\s*\}\s+from\s+['"]([^'"]+)['"]/gm

  let match
  while ((match = reexportRegex.exec(source)) !== null) {
    results.push({
      exportName: String(match[1] || '').trim(),
      source: String(match[2] || '').trim(),
      exportKind: 'default',
      line: indexToLine(source, match.index),
    })
  }

  return results
}

export function extractConstBindings(source) {
  const results = []
  const constRegex = /^\s*const\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+);?/gm

  let match
  while ((match = constRegex.exec(source)) !== null) {
    results.push({
      name: String(match[1] || '').trim(),
      expression: String(match[2] || '').trim(),
      line: indexToLine(source, match.index),
    })
  }

  return results
}

export function extractDeclaredRoutes(source, relativeFile) {
  const results = []
  const routeRegex = new RegExp(
    `\\b([A-Za-z_$][\\w$]*)\\.(${ROUTE_METHODS.join('|')})\\(\\s*${STATIC_STRING_TOKEN}`,
    'gm'
  )

  let match
  while ((match = routeRegex.exec(source)) !== null) {
    const declaredPath = readStaticStringMatch(match, 3)
    if (!declaredPath) continue

    results.push({
      framework: 'fastify',
      method: String(match[2] || '').toUpperCase(),
      path: declaredPath,
      file: relativeFile,
      line: indexToLine(source, match.index),
    })
  }

  return results
}

export function indexToLine(source, index) {
  if (!Number.isFinite(index) || index <= 0) return 1
  let line = 1
  for (let cursor = 0; cursor < index && cursor < source.length; cursor += 1) {
    if (source[cursor] === '\n') {
      line += 1
    }
  }
  return line
}

export function extractWithPatterns(source, language, relativeFile, patterns) {
  const results = []
  const normalizedLanguage = String(language).toLowerCase()
  for (const pattern of patterns) {
    if (!pattern.languages.includes(normalizedLanguage)) continue
    pattern.regex.lastIndex = 0
    let match
    while ((match = pattern.regex.exec(source)) !== null) {
      const name = String(match[1] ?? '').trim()
      if (!name) continue
      results.push({
        kind: pattern.kind,
        value: name,
        file: relativeFile,
        line: indexToLine(source, match.index),
      })
    }
  }
  return results
}
