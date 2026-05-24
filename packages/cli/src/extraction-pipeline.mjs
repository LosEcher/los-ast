/**
 * Call-graph and import-resolution pipeline step.
 * Wires los-ast's Tree-sitter extractors into the artifact export flow.
 *
 * Feature-gated behind the --experimental-extractors flag.
 */

import { readFileSync } from 'node:fs'

import { parse, registerDynamicLanguage } from '@ast-grep/napi'
import rust from '@ast-grep/lang-rust'

import { AstNodeAdapter } from '@los-ast/core/src/extraction/ast-adapter.mjs'
import { getExtractor } from '@los-ast/core/src/extraction/index.mjs'
import {
  resolveImport,
  extractExtraImportSources,
  buildResolutionContext,
} from '@los-ast/core/src/extraction/import-resolver/index.mjs'

let rustRegistered = false
function ensureRustRegistered() {
  if (rustRegistered) return
  try {
    registerDynamicLanguage({ rust })
    rustRegistered = true
  } catch {
    // Rust grammar already registered or unavailable
  }
}

/**
 * Build a structural summary from extraction results.
 * @param {Map<string, import('@los-ast/core/src/extraction/types.mjs').StructuralAnalysis>} perFile
 * @param {import('@los-ast/core/src/extraction/types.mjs').CallGraphEntry[]} allCallEdges
 * @returns {object}
 */
function buildStructuralSummary(perFile, allCallEdges) {
  /** @type {Record<string, { functions: number, classes: number, callEdges: number }>} */
  const byLanguage = {}
  let totalFunctions = 0
  let totalClasses = 0

  for (const [filePath, analysis] of perFile) {
    const ext = filePath.split('.').pop() || ''
    const langMap = {
      ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', mjs: 'javascript',
      rs: 'rust', go: 'go', py: 'python',
    }
    const lang = langMap[ext] || ext

    if (!byLanguage[lang]) {
      byLanguage[lang] = { functions: 0, classes: 0, callEdges: 0 }
    }
    byLanguage[lang].functions += analysis.functions.length
    byLanguage[lang].classes += analysis.classes.length
    totalFunctions += analysis.functions.length
    totalClasses += analysis.classes.length
  }

  for (const edge of allCallEdges) {
    const ext = (edge.file || '').split('.').pop() || ''
    const langMap = {
      ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', mjs: 'javascript',
      rs: 'rust', go: 'go', py: 'python',
    }
    const lang = langMap[ext] || ext
    if (lang) {
      if (!byLanguage[lang]) {
        byLanguage[lang] = { functions: 0, classes: 0, callEdges: 0 }
      }
      byLanguage[lang].callEdges += 1
    }
  }

  return {
    total_functions: totalFunctions,
    total_classes: totalClasses,
    total_call_edges: allCallEdges.length,
    by_language: byLanguage,
  }
}

/**
 * Normalize los-ast language name to extraction registry key.
 * @param {string} language
 * @returns {string | null}
 */
function normalizeLanguage(language) {
  const lang = String(language).toLowerCase()
  const map = {
    typescript: 'typescript', tsx: 'tsx',
    javascript: 'javascript', jsx: 'jsx',
    python: 'python', go: 'go', rust: 'rust',
  }
  return map[lang] || null
}

/**
 * Run the extraction pipeline over the given files.
 *
 * @param {object} opts
 * @param {string[]} opts.files - absolute file paths
 * @param {string} opts.rootDir - project root
 * @param {boolean} opts.deterministic
 * @returns {Promise<{ callEdges: object[], importsV2: object[], structuralSummary: object | null }>}
 */
export async function runExtractionPipeline({ files, rootDir, deterministic }) {
  ensureRustRegistered()

  /** @type {import('@los-ast/core/src/extraction/types.mjs').CallGraphEntry[]} */
  const allCallEdges = []
  /** @type {object[]} */
  const allImportsV2 = []
  /** @type {Map<string, import('@los-ast/core/src/extraction/types.mjs').StructuralAnalysis>} */
  const perFile = new Map()

  let totalProcessed = 0
  let totalParseFailures = 0

  // Build resolution context from all project files
  const filePaths = files.map((f) => {
    if (f.startsWith(rootDir)) return f.slice(rootDir.length + 1)
    return f
  })
  const resolveCtx = buildResolutionContext(rootDir, filePaths)

  for (const absolutePath of files) {
    const relativePath = absolutePath.startsWith(rootDir)
      ? absolutePath.slice(rootDir.length + 1)
      : absolutePath

    // Determine language from file extension
    const lower = absolutePath.toLowerCase()
    let language
    if (lower.endsWith('.ts')) language = 'typescript'
    else if (lower.endsWith('.tsx')) language = 'tsx'
    else if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) language = 'javascript'
    else if (lower.endsWith('.jsx')) language = 'jsx'
    else if (lower.endsWith('.rs')) language = 'rust'
    else if (lower.endsWith('.go')) language = 'go'
    else if (lower.endsWith('.py')) language = 'python'
    else continue

    const extractor = getExtractor(language)
    if (!extractor) continue

    let content
    try {
      content = readFileSync(absolutePath, 'utf-8')
    } catch {
      totalParseFailures++
      continue
    }

    // Parse with Tree-sitter via @ast-grep/napi
    let sgRoot
    try {
      sgRoot = parse(language, content)
    } catch {
      totalParseFailures++
      continue
    }

    const root = new AstNodeAdapter(sgRoot.root())

    // Extract structure and call graph
    let analysis
    try {
      analysis = extractor.extractStructure(root)
    } catch {
      totalParseFailures++
      continue
    }

    perFile.set(relativePath, analysis)

    // Collect call edges with file attribution
    try {
      const callGraph = extractor.extractCallGraph(root)
      for (const edge of callGraph) {
        allCallEdges.push({
          caller: edge.caller,
          callee: edge.callee,
          file: relativePath,
          line: edge.lineNumber,
        })
      }
    } catch {
      // Call graph extraction is best-effort
    }

    // Resolve imports to project-internal paths
    try {
      if (analysis.imports && analysis.imports.length > 0) {
        for (const imp of analysis.imports) {
          const fileInfo = { path: relativePath, language }
          const resolved = resolveImport(imp, fileInfo, resolveCtx)
          for (const targetPath of resolved) {
            allImportsV2.push({
              source_path: relativePath,
              target_path: targetPath,
              raw_specifier: imp.source,
              specifiers: imp.specifiers,
              kind: 'es6',
              resolved: true,
            })
          }
          // Unresolved = external (still record as metadata)
          if (resolved.length === 0) {
            allImportsV2.push({
              source_path: relativePath,
              target_path: null,
              raw_specifier: imp.source,
              specifiers: imp.specifiers,
              kind: 'es6',
              resolved: false,
            })
          }
        }
      }

      // Extra sources (CJS require(), Rust mod declarations)
      const extraSources = extractExtraImportSources({ path: relativePath, language }, content)
      for (const extra of extraSources) {
        const fileInfo = { path: relativePath, language }
        const resolved = resolveImport({ source: extra, specifiers: [] }, fileInfo, resolveCtx)
        for (const targetPath of resolved) {
          allImportsV2.push({
            source_path: relativePath,
            target_path: targetPath,
            raw_specifier: extra,
            specifiers: [],
            kind: 'supplemental',
            resolved: true,
          })
        }
      }
    } catch {
      // Import resolution is best-effort
    }

    totalProcessed++
  }

  const structuralSummary = buildStructuralSummary(perFile, allCallEdges)

  if (deterministic) {
    allCallEdges.sort((a, b) =>
      `${a.file}:${a.line}`.localeCompare(`${b.file}:${b.line}`))
    allImportsV2.sort((a, b) =>
      `${a.source_path}:${a.raw_specifier}`.localeCompare(`${b.source_path}:${b.raw_specifier}`))
  }

  return {
    callEdges: allCallEdges,
    importsV2: allImportsV2,
    structuralSummary,
    _stats: { totalProcessed, totalParseFailures },
  }
}
