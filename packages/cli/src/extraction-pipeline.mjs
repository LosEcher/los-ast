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
import { reconcile } from '@los-ast/core'

const EXTRACTION_CHUNK_SIZE = 250

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
 * Process a single file in the extraction pipeline.
 * Encapsulated for reuse in both sequential and chunked paths.
 *
 * @param {string} absolutePath
 * @param {string} rootDir
 * @param {object} resolveCtx
 * @returns {{ callEdges: object[], importsV2: object[], perFile: [string, object] | null, processed: boolean, parseFailed: boolean }}
 */
function _extractFile(absolutePath, rootDir, resolveCtx) {
  const relativePath = absolutePath.startsWith(rootDir)
    ? absolutePath.slice(rootDir.length + 1)
    : absolutePath

  const lower = absolutePath.toLowerCase()
  let language
  if (lower.endsWith('.ts')) language = 'typescript'
  else if (lower.endsWith('.tsx')) language = 'tsx'
  else if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) language = 'javascript'
  else if (lower.endsWith('.jsx')) language = 'jsx'
  else if (lower.endsWith('.rs')) language = 'rust'
  else if (lower.endsWith('.go')) language = 'go'
  else if (lower.endsWith('.py')) language = 'python'
  else return { callEdges: [], importsV2: [], perFile: null, processed: false, parseFailed: false }

  const extractor = getExtractor(language)
  if (!extractor) return { callEdges: [], importsV2: [], perFile: null, processed: false, parseFailed: false }

  let content
  try {
    content = readFileSync(absolutePath, 'utf-8')
  } catch {
    return { callEdges: [], importsV2: [], perFile: null, processed: false, parseFailed: true }
  }

  let sgRoot
  try {
    sgRoot = parse(language, content)
  } catch {
    return { callEdges: [], importsV2: [], perFile: null, processed: false, parseFailed: true }
  }

  const root = new AstNodeAdapter(sgRoot.root())

  let analysis
  try {
    analysis = extractor.extractStructure(root)
  } catch {
    return { callEdges: [], importsV2: [], perFile: null, processed: false, parseFailed: true }
  }

  const callEdges = []
  const importsV2 = []

  // Collect call edges
  try {
    const callGraph = extractor.extractCallGraph(root)
    for (const edge of callGraph) {
      callEdges.push({
        caller: edge.caller,
        callee: edge.callee,
        file: relativePath,
        line: edge.lineNumber,
      })
    }
  } catch {
    // Best-effort
  }

  // Resolve imports
  try {
    if (analysis.imports && analysis.imports.length > 0) {
      for (const imp of analysis.imports) {
        const fileInfo = { path: relativePath, language }
        const resolved = resolveImport(imp, fileInfo, resolveCtx)
        for (const targetPath of resolved) {
          importsV2.push({
            source_path: relativePath,
            target_path: targetPath,
            raw_specifier: imp.source,
            specifiers: imp.specifiers,
            kind: 'es6',
            resolved: true,
          })
        }
        if (resolved.length === 0) {
          importsV2.push({
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

    const extraSources = extractExtraImportSources({ path: relativePath, language }, content)
    for (const extra of extraSources) {
      const fileInfo = { path: relativePath, language }
      const resolved = resolveImport({ source: extra, specifiers: [] }, fileInfo, resolveCtx)
      for (const targetPath of resolved) {
        importsV2.push({
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
    // Best-effort
  }

  return {
    callEdges,
    importsV2,
    perFile: [relativePath, analysis],
    processed: true,
    parseFailed: false,
  }
}

/**
 * Process a chunk of files synchronously (one chunk worker).
 *
 * @param {string[]} chunkFiles
 * @param {string} rootDir
 * @param {object} resolveCtx
 * @returns {{ callEdges: object[], importsV2: object[], perFileEntries: Array<[string, object]>, processed: number, parseFailed: number }}
 */
function _extractChunk(chunkFiles, rootDir, resolveCtx) {
  const allCallEdges = []
  const allImportsV2 = []
  const perFileEntries = []
  let processed = 0
  let parseFailed = 0

  for (const file of chunkFiles) {
    const result = _extractFile(file, rootDir, resolveCtx)
    allCallEdges.push(...result.callEdges)
    allImportsV2.push(...result.importsV2)
    if (result.perFile) perFileEntries.push(result.perFile)
    if (result.processed) processed++
    if (result.parseFailed) parseFailed++
  }

  return { callEdges: allCallEdges, importsV2: allImportsV2, perFileEntries, processed, parseFailed }
}

/**
 * Run the extraction pipeline over the given files.
 *
 * For large projects (>250 files), processes files in parallel chunks
 * and reconciles cross-chunk call edges, imports, and structural summaries.
 *
 * @param {object} opts
 * @param {string[]} opts.files - absolute file paths
 * @param {string} opts.rootDir - project root
 * @param {boolean} opts.deterministic
 * @returns {Promise<{ callEdges: object[], importsV2: object[], structuralSummary: object | null }>}
 */
export async function runExtractionPipeline({ files, rootDir, deterministic }) {
  ensureRustRegistered()

  // Build resolution context once — shared across all chunks
  const filePaths = files.map((f) => {
    if (f.startsWith(rootDir)) return f.slice(rootDir.length + 1)
    return f
  })
  const resolveCtx = buildResolutionContext(rootDir, filePaths)

  const useChunked = files.length > EXTRACTION_CHUNK_SIZE
  let allCallEdges, allImportsV2, perFile, totalProcessed, totalParseFailures

  if (useChunked) {
    // Split into chunks, process in parallel
    const chunks = []
    for (let i = 0; i < files.length; i += EXTRACTION_CHUNK_SIZE) {
      chunks.push(files.slice(i, i + EXTRACTION_CHUNK_SIZE))
    }

    const chunkResults = await Promise.all(
      chunks.map((chunk) => _extractChunk(chunk, rootDir, resolveCtx)),
    )

    // Merge per-file structural data
    perFile = new Map()
    for (const r of chunkResults) {
      for (const [filePath, analysis] of r.perFileEntries) {
        perFile.set(filePath, analysis)
      }
    }

    // Collect raw call edges and imports before reconciliation
    const rawCallEdges = chunkResults.flatMap((r) => r.callEdges)
    const rawImportsV2 = chunkResults.flatMap((r) => r.importsV2)

    // Build per-chunk structural summaries for merge
    const perChunkSummaries = chunkResults.map((r) => {
      const chunkPerFile = new Map(r.perFileEntries)
      return buildStructuralSummary(chunkPerFile, r.callEdges)
    })

    // Reconcile across chunks: dedup call edges, dedup imports, merge summaries
    const reconciled = await reconcile({
      allCallEdges: rawCallEdges,
      allImportsV2: rawImportsV2,
      structuralSummary: {
        _perChunk: perChunkSummaries,
        total_functions: 0,
        total_classes: 0,
        total_call_edges: 0,
        by_language: {},
      },
      deterministic,
    })

    allCallEdges = reconciled.callEdges
    allImportsV2 = reconciled.importsV2
    totalProcessed = chunkResults.reduce((s, r) => s + r.processed, 0)
    totalParseFailures = chunkResults.reduce((s, r) => s + r.parseFailed, 0)

    return {
      callEdges: allCallEdges,
      importsV2: allImportsV2,
      structuralSummary: reconciled.structuralSummary,
      _stats: { totalProcessed, totalParseFailures },
    }
  }

  // ── Sequential path for small projects ──
  allCallEdges = []
  allImportsV2 = []
  perFile = new Map()
  totalProcessed = 0
  totalParseFailures = 0

  const result = _extractChunk(files, rootDir, resolveCtx)
  allCallEdges = result.callEdges
  allImportsV2 = result.importsV2
  for (const [filePath, analysis] of result.perFileEntries) {
    perFile.set(filePath, analysis)
  }
  totalProcessed = result.processed
  totalParseFailures = result.parseFailed

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
