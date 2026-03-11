import fs from 'node:fs/promises'
import path from 'node:path'

import { getProjectAdapter, listProjects } from '@los-ast/adapters'
import {
  discoverFiles,
  languageFromFilePath,
  loadRuleFiles,
  scan,
  toJsonLines,
} from '@los-ast/core'

function normalizeArray(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.flatMap((v) => String(v).split(',')).map((s) => s.trim()).filter(Boolean)
  return String(value).split(',').map((s) => s.trim()).filter(Boolean)
}

function toPosixRelative(rootDir, filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/')
}

async function resolveWorkspace(options) {
  if (options.project && options.project !== 'custom' && !options.root) {
    const adapter = getProjectAdapter(options.project)
    return {
      project: adapter.project,
      rootDir: adapter.rootDir,
      include: normalizeArray(options.include).length ? normalizeArray(options.include) : adapter.include,
      ignore: normalizeArray(options.ignore).length ? normalizeArray(options.ignore) : adapter.ignore,
      ruleGlobs: adapter.ruleGlobs,
    }
  }

  if (options.root) {
    const project = options.project || 'custom'
    return {
      project,
      rootDir: path.resolve(options.root),
      include: normalizeArray(options.include),
      ignore: normalizeArray(options.ignore),
      ruleGlobs: [
        'rules/languages/**/*.yml',
        'rules/languages/**/*.yaml',
        `rules/projects/${project}/**/*.yml`,
        `rules/projects/${project}/**/*.yaml`,
      ],
    }
  }

  throw new Error(`missing required option: --root (or use --project ${listProjects().join('|')})`)
}

async function resolveRules(options) {
  const ws = await resolveWorkspace(options)
  const explicitPatterns = normalizeArray(options.rules)
  return loadRuleFiles([...ws.ruleGlobs, ...explicitPatterns])
}

function parseArgs(argv) {
  const args = {
    root: '',
    project: 'custom',
    include: [],
    ignore: [],
    rules: [],
    outputDir: '',
    deterministic: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] ?? '').trim()
    const next = String(argv[index + 1] ?? '').trim()
    if (token === '--root') {
      args.root = next
      index += 1
      continue
    }
    if (token === '--project') {
      args.project = next || args.project
      index += 1
      continue
    }
    if (token === '--include') {
      args.include.push(next)
      index += 1
      continue
    }
    if (token === '--ignore') {
      args.ignore.push(next)
      index += 1
      continue
    }
    if (token === '--rules') {
      args.rules.push(next)
      index += 1
      continue
    }
    if (token === '--output-dir') {
      args.outputDir = next
      index += 1
      continue
    }
    if (token === '--deterministic') {
      args.deterministic = true
    }
  }

  return args
}

const TEXT_SYMBOL_PATTERNS = [
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

const TEXT_IMPORT_PATTERNS = [
  { kind: 'import', languages: ['typescript', 'javascript', 'tsx', 'jsx'], regex: /^\s*import(?:\s+type)?[\s\S]*?from\s+['"]([^'"]+)['"]/gm },
  { kind: 'import', languages: ['typescript', 'javascript', 'tsx', 'jsx'], regex: /^\s*import\s+['"]([^'"]+)['"]/gm },
  { kind: 'require', languages: ['typescript', 'javascript', 'tsx', 'jsx'], regex: /\brequire\(\s*['"]([^'"]+)['"]\s*\)/gm },
  { kind: 'use', languages: ['rust'], regex: /^\s*use\s+([^;]+);/gm },
]

function classifyFileRole(relativeFile) {
  const normalized = String(relativeFile).split(path.sep).join('/')
  if (/(^|\/)src\/admin\/app\/pages\//.test(normalized)) return 'page'
  if (/(^|\/)src\/admin\/app\/chat\/api-client\./.test(normalized)) return 'api_client'
  if (/(^|\/)src\/admin\/app\/utils\//.test(normalized)) return 'ui_helper'
  if (/(^|\/)src\/shared\/contracts\//.test(normalized)) return 'contract'
  if (/(^|\/)src\/routes\//.test(normalized)) return 'route'
  if (/(^|\/)src\/state\//.test(normalized)) return 'state'
  if (/(^|\/)src\/admin\/app\/components\//.test(normalized)) return 'component'
  if (/(^|\/)scripts\//.test(normalized)) return 'script'
  if (/(^|\/)test\//.test(normalized)) return 'test'
  return 'source'
}

function indexToLine(source, index) {
  if (!Number.isFinite(index) || index <= 0) return 1
  let line = 1
  for (let cursor = 0; cursor < index && cursor < source.length; cursor += 1) {
    if (source[cursor] === '\n') {
      line += 1
    }
  }
  return line
}

function extractWithPatterns(source, language, relativeFile, patterns) {
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

async function extractFileFacts(file, rootDir) {
  const language = languageFromFilePath(file)
  if (!language) {
    return {
      file: {
        path: toPosixRelative(rootDir, file),
        language: null,
        role: classifyFileRole(toPosixRelative(rootDir, file)),
      },
      symbols: [],
      imports: [],
      declares: [],
    }
  }

  const source = await fs.readFile(file, 'utf-8')
  const relativeFile = toPosixRelative(rootDir, file)
  const normalizedLanguage = String(language).toLowerCase()

  const symbols = extractWithPatterns(source, normalizedLanguage, relativeFile, TEXT_SYMBOL_PATTERNS)
    .map((item) => ({
      name: item.value,
      kind: item.kind,
      file: item.file,
      line: item.line,
    }))

  const imports = extractWithPatterns(source, normalizedLanguage, relativeFile, TEXT_IMPORT_PATTERNS)
    .map((item) => ({
      from: relativeFile,
      to: item.value,
      kind: item.kind,
    }))

  const declares = symbols.map((item) => ({
    file: item.file,
    symbol: item.name,
    kind: item.kind,
  }))

  return {
    file: {
      path: relativeFile,
      language: normalizedLanguage,
      role: classifyFileRole(relativeFile),
    },
    symbols,
    imports,
    declares,
  }
}

async function exportArtifacts(options) {
  const ws = await resolveWorkspace(options)
  const rules = await resolveRules(options)
  const outputDir = path.resolve(options.outputDir || path.join(ws.rootDir, 'logs', 'hub-lite-artifacts'))
  const deterministic = Boolean(options.deterministic)

  const scanResult = await scan({
    project: ws.project,
    rootDir: ws.rootDir,
    include: ws.include,
    ignore: ws.ignore,
    rules,
    deterministic,
  })

  const files = await discoverFiles({
    rootDir: ws.rootDir,
    include: ws.include,
    ignore: ws.ignore,
  })

  const structureFiles = []
  const structureSymbols = []
  const structureImports = []
  const structureDeclares = []
  for (const file of files) {
    const facts = await extractFileFacts(file, ws.rootDir)
    structureFiles.push(facts.file)
    structureSymbols.push(...facts.symbols)
    structureImports.push(...facts.imports)
    structureDeclares.push(...facts.declares)
  }

  if (deterministic) {
    structureFiles.sort((a, b) => String(a.path).localeCompare(String(b.path)))
    structureSymbols.sort((a, b) => `${a.file}:${a.name}:${a.kind}`.localeCompare(`${b.file}:${b.name}:${b.kind}`))
    structureImports.sort((a, b) => `${a.from}:${a.to}:${a.kind}`.localeCompare(`${b.from}:${b.to}:${b.kind}`))
    structureDeclares.sort((a, b) => `${a.file}:${a.symbol}:${a.kind}`.localeCompare(`${b.file}:${b.symbol}:${b.kind}`))
  }

  const structureMap = {
    schema: 'lsclaw.los-ast.structure-map.v1',
    version: '1.0.0',
    project: ws.project,
    rootDir: ws.rootDir,
    generatedAt: deterministic ? '1970-01-01T00:00:00.000Z' : new Date().toISOString(),
    source: {
      tool: 'los-ast',
      mode: 'cli',
      scanArtifactPath: 'scan-findings.jsonl',
      symbolsArtifactPath: 'symbols.json',
    },
    files: structureFiles,
    symbols: structureSymbols,
    imports: structureImports,
    declares: structureDeclares,
    route_binds: [],
  }

  await fs.mkdir(outputDir, { recursive: true })
  await fs.writeFile(path.join(outputDir, 'scan-findings.jsonl'), toJsonLines(scanResult.findings, deterministic), 'utf-8')
  await fs.writeFile(path.join(outputDir, 'symbols.json'), `${JSON.stringify(structureSymbols, null, 2)}\n`, 'utf-8')
  await fs.writeFile(path.join(outputDir, 'structure-map.json'), `${JSON.stringify(structureMap, null, 2)}\n`, 'utf-8')

  const summary = {
    ok: true,
    project: ws.project,
    rootDir: ws.rootDir,
    outputDir,
    artifactPaths: {
      scanFindings: path.join(outputDir, 'scan-findings.jsonl'),
      symbols: path.join(outputDir, 'symbols.json'),
      structureMap: path.join(outputDir, 'structure-map.json'),
    },
    counts: {
      findings: scanResult.findings.length,
      files: structureFiles.length,
      symbols: structureSymbols.length,
      imports: structureImports.length,
      declares: structureDeclares.length,
      routeBinds: 0,
    },
    limitations: [
      'route_binds is emitted as an empty array in first-pass export',
    ],
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.stdout.write(`Usage: node ./packages/cli/src/export-artifacts.mjs --root <dir> [options]

Options:
  --project <name>       project name for rule selection (default: custom)
  --include <glob>       include pattern, can be repeated
  --ignore <glob>        ignore pattern, can be repeated
  --rules <glob>         extra rule pattern, can be repeated
  --output-dir <dir>     output directory for generated artifacts
  --deterministic        stable timestamps and ordering
`)
  process.exit(0)
}

const args = parseArgs(process.argv.slice(2))
exportArtifacts(args).catch((error) => {
  process.stderr.write(`${error?.stack || error?.message || String(error)}\n`)
  process.exit(1)
})
