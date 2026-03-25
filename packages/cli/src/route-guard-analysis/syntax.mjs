function findMatchingBrace(source, openBraceIndex) {
  if (openBraceIndex < 0 || source[openBraceIndex] !== '{') return -1
  let depth = 0
  for (let index = openBraceIndex; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

function indexToLine(source, index) {
  if (!Number.isFinite(index) || index <= 0) return 1
  return source.slice(0, index).split(/\r?\n/).length
}

function stripWrappingParens(expression) {
  let normalized = String(expression || '').trim()
  while (normalized.startsWith('(') && normalized.endsWith(')')) {
    let depth = 0
    let balanced = true
    for (let index = 0; index < normalized.length; index += 1) {
      const char = normalized[index]
      if (char === '(') depth += 1
      if (char === ')') {
        depth -= 1
        if (depth === 0 && index < normalized.length - 1) {
          balanced = false
          break
        }
      }
    }
    if (!balanced || depth !== 0) break
    normalized = normalized.slice(1, -1).trim()
  }
  return normalized
}

function splitTopLevelArguments(segment) {
  const input = String(segment || '').trim()
  if (!input) return []

  const parts = []
  let current = ''
  let depth = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let inTemplate = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    const next = input[index + 1]
    const prev = input[index - 1]

    if (inSingleQuote) {
      current += char
      if (char === "'" && prev !== '\\') inSingleQuote = false
      continue
    }

    if (inDoubleQuote) {
      current += char
      if (char === '"' && prev !== '\\') inDoubleQuote = false
      continue
    }

    if (inTemplate) {
      current += char
      if (char === '`' && prev !== '\\') {
        inTemplate = false
        continue
      }
      if (char === '$' && next === '{') {
        depth += 1
        current += next
        index += 1
        continue
      }
      if (char === '{' && depth > 0) {
        depth += 1
        continue
      }
      if (char === '}' && depth > 0) {
        depth -= 1
      }
      continue
    }

    if (char === "'") {
      inSingleQuote = true
      current += char
      continue
    }

    if (char === '"') {
      inDoubleQuote = true
      current += char
      continue
    }

    if (char === '`') {
      inTemplate = true
      current += char
      continue
    }

    if (char === '(' || char === '{' || char === '[') {
      depth += 1
      current += char
      continue
    }

    if (char === ')' || char === '}' || char === ']') {
      depth = Math.max(0, depth - 1)
      current += char
      continue
    }

    if (depth === 0 && char === ',') {
      parts.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  if (current.trim()) parts.push(current.trim())
  return parts
}

function parseParameterNames(paramsRaw) {
  return splitTopLevelArguments(paramsRaw)
    .map((param) => String(param || '').trim())
    .filter(Boolean)
    .map((param) => {
      const withoutDefault = param.split('=').map((part) => part.trim())[0]
      const withoutType = withoutDefault.split(':').map((part) => part.trim())[0]
      const cleaned = withoutType.replace(/^\.{3}/, '').trim()
      return /^[A-Za-z_$][\w$]*$/.test(cleaned) ? cleaned : null
    })
    .filter(Boolean)
}

function stripComments(source) {
  return String(source || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

function splitTopLevelStatements(source) {
  const statements = []
  let current = ''
  let parenDepth = 0
  let bracketDepth = 0
  let braceDepth = 0
  let templateDepth = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let inTemplate = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]
    const prev = source[index - 1]

    if (inSingleQuote) {
      current += char
      if (char === "'" && prev !== '\\') inSingleQuote = false
      continue
    }

    if (inDoubleQuote) {
      current += char
      if (char === '"' && prev !== '\\') inDoubleQuote = false
      continue
    }

    if (inTemplate) {
      current += char
      if (char === '`' && prev !== '\\' && templateDepth === 0) {
        inTemplate = false
        continue
      }
      if (char === '$' && next === '{') {
        templateDepth += 1
        current += next
        index += 1
        continue
      }
      if (char === '{' && templateDepth > 0) {
        templateDepth += 1
        continue
      }
      if (char === '}' && templateDepth > 0) {
        templateDepth -= 1
      }
      continue
    }

    if (char === "'") {
      inSingleQuote = true
      current += char
      continue
    }

    if (char === '"') {
      inDoubleQuote = true
      current += char
      continue
    }

    if (char === '`') {
      inTemplate = true
      current += char
      continue
    }

    if (char === '(') {
      parenDepth += 1
      current += char
      continue
    }

    if (char === ')') {
      parenDepth = Math.max(0, parenDepth - 1)
      current += char
      continue
    }

    if (char === '[') {
      bracketDepth += 1
      current += char
      continue
    }

    if (char === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1)
      current += char
      continue
    }

    if (char === '{') {
      braceDepth += 1
      current += char
      continue
    }

    if (char === '}') {
      braceDepth = Math.max(0, braceDepth - 1)
      current += char
      continue
    }

    if (parenDepth === 0 && bracketDepth === 0 && braceDepth === 0 && (char === ';' || char === '\n')) {
      if (current.trim()) {
        statements.push(current.trim())
      }
      current = ''
      continue
    }

    current += char
  }

  if (current.trim()) {
    statements.push(current.trim())
  }

  return statements
}

function splitTopLevelLogical(expression, operator) {
  const normalized = String(expression || '').trim()
  if (!normalized) return []

  const parts = []
  let current = ''
  let depth = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let inTemplate = false

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]
    const next = normalized[index + 1]
    const prev = normalized[index - 1]

    if (inSingleQuote) {
      current += char
      if (char === "'" && prev !== '\\') inSingleQuote = false
      continue
    }

    if (inDoubleQuote) {
      current += char
      if (char === '"' && prev !== '\\') inDoubleQuote = false
      continue
    }

    if (inTemplate) {
      current += char
      if (char === '`' && prev !== '\\' && depth === 0) {
        inTemplate = false
        continue
      }
      if (char === '$' && next === '{') {
        depth += 1
        current += next
        index += 1
        continue
      }
      if (char === '{' && depth > 0) {
        depth += 1
        continue
      }
      if (char === '}' && depth > 0) {
        depth -= 1
      }
      continue
    }

    if (char === "'") {
      inSingleQuote = true
      current += char
      continue
    }

    if (char === '"') {
      inDoubleQuote = true
      current += char
      continue
    }

    if (char === '`') {
      inTemplate = true
      current += char
      continue
    }

    if (char === '(') {
      depth += 1
      current += char
      continue
    }

    if (char === ')') {
      depth = Math.max(0, depth - 1)
      current += char
      continue
    }

    if (depth === 0 && char === operator[0] && next === operator[1]) {
      parts.push(current.trim())
      current = ''
      index += 1
      continue
    }

    current += char
  }

  if (current.trim()) parts.push(current.trim())
  return parts
}

export {
  findMatchingBrace,
  indexToLine,
  parseParameterNames,
  splitTopLevelArguments,
  splitTopLevelLogical,
  splitTopLevelStatements,
  stripComments,
  stripWrappingParens,
}
