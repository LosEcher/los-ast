import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { parse, registerDynamicLanguage } from '@ast-grep/napi'
import rust from '@ast-grep/lang-rust'

import { AstNodeAdapter, adaptRoot } from '../packages/core/src/extraction/ast-adapter.mjs'
import { TypeScriptExtractor } from '../packages/core/src/extraction/extractors/typescript-extractor.mjs'
import { RustExtractor } from '../packages/core/src/extraction/extractors/rust-extractor.mjs'
import { getExtractor } from '../packages/core/src/extraction/index.mjs'
import { buildResolutionContext } from '../packages/core/src/extraction/import-resolver/resolver-context.mjs'
import { resolveTsJsImport } from '../packages/core/src/extraction/import-resolver/ts-js-resolver.mjs'
import { runExtractionPipeline } from '../packages/cli/src/extraction-pipeline.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturesRoot = path.resolve(__dirname, '..', 'fixtures', 'golden')

let rustRegistered = false
function ensureRust() {
  if (rustRegistered) return
  try { registerDynamicLanguage({ rust }); rustRegistered = true } catch { /* ok */ }
}

// ---------------------------------------------------------------------------
// AstNodeAdapter
// ---------------------------------------------------------------------------

test('AstNodeAdapter wraps @ast-grep/napi node with tree-sitter-compatible API', () => {
  const code = 'function hello(name: string): string { return name }'
  const sgRoot = parse('typescript', code)
  const root = adaptRoot(sgRoot)

  assert.equal(root.type, 'program')
  assert.ok(root.childCount >= 1)
  assert.ok(root.text.includes('function'))

  const fn = root.child(0)
  assert.ok(fn)
  assert.equal(fn.type, 'function_declaration')

  // childForFieldName
  const nameNode = fn.childForFieldName('name')
  assert.ok(nameNode)
  assert.equal(nameNode.type, 'identifier')
  assert.equal(nameNode.text, 'hello')

  const paramsNode = fn.childForFieldName('parameters')
  assert.ok(paramsNode)
  assert.equal(paramsNode.type, 'formal_parameters')

  // startPosition / endPosition
  assert.equal(fn.startPosition.row, 0)
  assert.equal(fn.startPosition.column, 0)
  assert.ok(fn.endPosition.row >= 0)

  // parent chain
  assert.equal(fn.parent.type, 'program')
  assert.equal(nameNode.parent.type, 'function_declaration')

  // children
  const fnChildren = fn.children
  assert.ok(fnChildren.length > 0)
  assert.ok(fnChildren.some((c) => c.type === 'identifier' && c.text === 'hello'))

  // child(i) out of bounds
  assert.equal(fn.child(999), null)
})

test('AstNodeAdapter handles nested structures', () => {
  const code = 'class Foo { bar(): void { baz() } }'
  const sgRoot = parse('typescript', code)
  const root = adaptRoot(sgRoot)

  const classDecl = root.child(0)
  assert.equal(classDecl.type, 'class_declaration')

  const classBody = classDecl.children.find((c) => c.type === 'class_body')
  assert.ok(classBody)

  // First child of class_body is '{' (unnamed), second is the method
  const method = classBody.children.find((c) => c.type === 'method_definition')
  assert.ok(method)
  assert.equal(method.childForFieldName('name')?.text, 'bar')

  // Navigate into method body to find call_expression
  const stmtBlock = method.children.find((c) => c.type === 'statement_block')
  assert.ok(stmtBlock)
})

// ---------------------------------------------------------------------------
// TypeScript / JavaScript extractor
// ---------------------------------------------------------------------------

test('TypeScriptExtractor extracts functions and classes', () => {
  const code = `
function add(a: number, b: number): number {
  return a + b
}

class Calculator {
  result: number = 0

  add(val: number): void {
    this.result += val
  }

  getResult(): number {
    return this.result
  }
}

const multiply = (x: number, y: number): number => x * y

export function subtract(a: number, b: number): number {
  return a - b
}
`.trim()

  const extractor = new TypeScriptExtractor()
  const sgRoot = parse('typescript', code)
  const root = adaptRoot(sgRoot)
  const analysis = extractor.extractStructure(root)

  assert.equal(analysis.functions.length, 3)

  const addFn = analysis.functions.find((f) => f.name === 'add')
  assert.ok(addFn)
  assert.deepEqual(addFn.params, ['a', 'b'])
  assert.equal(addFn.returnType, 'number')

  const multiplyFn = analysis.functions.find((f) => f.name === 'multiply')
  assert.ok(multiplyFn)

  const subtractFn = analysis.functions.find((f) => f.name === 'subtract')
  assert.ok(subtractFn)

  // Classes
  assert.equal(analysis.classes.length, 1)
  const calc = analysis.classes[0]
  assert.equal(calc.name, 'Calculator')
  assert.ok(calc.methods.includes('add'))
  assert.ok(calc.methods.includes('getResult'))
  assert.ok(calc.properties.includes('result'))

  // Exports
  assert.ok(analysis.exports.some((e) => e.name === 'subtract'))
})

test('TypeScriptExtractor extracts imports', () => {
  const code = `
import { foo, bar } from './utils'
import * as lib from 'external-lib'
import Baz from './baz'
`.trim()

  const extractor = new TypeScriptExtractor()
  const sgRoot = parse('typescript', code)
  const root = adaptRoot(sgRoot)
  const analysis = extractor.extractStructure(root)

  assert.equal(analysis.imports.length, 3)

  const namedImport = analysis.imports.find((i) => i.source === './utils')
  assert.ok(namedImport)
  assert.ok(namedImport.specifiers.includes('foo'))
  assert.ok(namedImport.specifiers.includes('bar'))

  const nsImport = analysis.imports.find((i) => i.source === 'external-lib')
  assert.ok(nsImport)
  assert.ok(nsImport.specifiers.some((s) => s.includes('lib')))
})

test('TypeScriptExtractor extracts call graph', () => {
  const code = `
function outer(): void {
  inner()
  helper()
}

function inner(): void {
  helper()
  deepCall()
}

function helper(): void {}
function deepCall(): void {}
`.trim()

  const extractor = new TypeScriptExtractor()
  const sgRoot = parse('typescript', code)
  const root = adaptRoot(sgRoot)
  const callGraph = extractor.extractCallGraph(root)

  assert.ok(callGraph.length >= 4)

  // callee text is just the identifier, not 'identifier()'
  const outerInner = callGraph.find((e) => e.caller === 'outer' && e.callee === 'inner')
  assert.ok(outerInner)

  const outerHelper = callGraph.find((e) => e.caller === 'outer' && e.callee === 'helper')
  assert.ok(outerHelper)

  const innerDeep = callGraph.find((e) => e.caller === 'inner' && e.callee === 'deepCall')
  assert.ok(innerDeep)
})

test('TypeScriptExtractor extracts structure from fixture file', () => {
  const filePath = path.join(fixturesRoot, 'lsclaw-sample', 'src', 'config.ts')
  const code = readFileSync(filePath, 'utf-8')

  const extractor = new TypeScriptExtractor()
  const sgRoot = parse('typescript', code)
  const root = adaptRoot(sgRoot)
  const analysis = extractor.extractStructure(root)

  // ConfigManager class
  assert.equal(analysis.classes.length, 1)
  const configMgr = analysis.classes[0]
  assert.equal(configMgr.name, 'ConfigManager')
  assert.ok(configMgr.methods.includes('load'))
  assert.ok(configMgr.methods.includes('get'))
  assert.ok(configMgr.methods.includes('getAll'))
  assert.ok(configMgr.properties.includes('configPath'))
  assert.ok(configMgr.properties.includes('config'))

  // Imports from 'fs' and 'path'
  assert.ok(analysis.imports.some((i) => i.source === 'fs'))
  assert.ok(analysis.imports.some((i) => i.source === 'path'))

  // Export
  assert.ok(analysis.exports.some((e) => e.name === 'ConfigManager'))
})

test('TypeScriptExtractor call graph from fixture file', () => {
  const filePath = path.join(fixturesRoot, 'lsclaw-sample', 'src', 'config.ts')
  const code = readFileSync(filePath, 'utf-8')

  const extractor = new TypeScriptExtractor()
  const sgRoot = parse('typescript', code)
  const root = adaptRoot(sgRoot)
  const callGraph = extractor.extractCallGraph(root)

  assert.ok(callGraph.length > 0)
  const methodCallers = [...new Set(callGraph.map((e) => e.caller))]
  assert.ok(methodCallers.includes('load'))
})

// ---------------------------------------------------------------------------
// Rust extractor
// ---------------------------------------------------------------------------

test('RustExtractor extracts functions, structs, impls, and traits', () => {
  ensureRust()

  const code = `
pub fn parse_input(input: &str) -> Result<Vec<String>, String> {
    if input.is_empty() {
        return Err("empty".to_string())
    }
    Ok(input.split(',').map(|s| s.trim().to_string()).collect())
}

pub struct Config {
    pub version: String,
    pub port: u16,
}

impl Config {
    pub fn new(version: String) -> Self {
        Config { version, port: 8080 }
    }
    fn validate(&self) -> bool {
        !self.version.is_empty()
    }
}

pub trait Validatable {
    fn validate(&self) -> bool;
}

#[test]
fn test_parse() {
    let result = parse_input("a,b").unwrap();
    assert_eq!(result.len(), 2);
}
`.trim()

  const extractor = new RustExtractor()
  const sgRoot = parse('rust', code)
  const root = adaptRoot(sgRoot)
  const analysis = extractor.extractStructure(root)

  // Functions: parse_input (pub), test_parse (#[test])
  assert.equal(analysis.functions.length, 2)

  const parseInput = analysis.functions.find((f) => f.name === 'parse_input')
  assert.ok(parseInput)
  assert.ok(parseInput.params.includes('input'))
  assert.equal(parseInput.returnType, 'Result<Vec<String>, String>')

  // Classes: Config struct + Validatable trait = 2
  assert.equal(analysis.classes.length, 2)

  const configStruct = analysis.classes.find((c) => c.name === 'Config')
  assert.ok(configStruct)
  assert.ok(configStruct.properties.includes('version'))
  assert.ok(configStruct.properties.includes('port'))

  const validatable = analysis.classes.find((c) => c.name === 'Validatable')
  assert.ok(validatable)
  assert.ok(validatable.methods.includes('validate'))

  // Exports — only pub items (not #[test])
  assert.ok(analysis.exports.some((e) => e.name === 'parse_input'))
  assert.ok(analysis.exports.some((e) => e.name === 'Config'))
  assert.ok(!analysis.exports.some((e) => e.name === 'test_parse'))
})

test('RustExtractor extracts use declarations and call graph', () => {
  ensureRust()

  const code = `
use std::collections::HashMap;
use crate::utils::{helper, format_output};

pub fn process(items: Vec<String>) -> String {
    let mapped = helper(items);
    format_output(&mapped)
}

fn helper(items: Vec<String>) -> HashMap<String, usize> {
    let mut map = HashMap::new();
    for item in items {
        map.insert(item, 1);
    }
    map
}
`.trim()

  const extractor = new RustExtractor()
  const sgRoot = parse('rust', code)
  const root = adaptRoot(sgRoot)
  const analysis = extractor.extractStructure(root)

  // Scoped use statements are expanded to individual imports
  assert.ok(analysis.imports.length > 0)
  const stdImport = analysis.imports.find((i) => i.source === 'std::collections::HashMap')
  assert.ok(stdImport)

  // crate::utils::{helper, format_output} → individual entries
  const crateHelper = analysis.imports.find((i) => i.source === 'crate::utils::helper')
  assert.ok(crateHelper)

  // Call graph
  const callGraph = extractor.extractCallGraph(root)
  const processCallToHelper = callGraph.find((e) => e.caller === 'process' && e.callee === 'helper')
  assert.ok(processCallToHelper)
})

test('RustExtractor extracts structure from fixture file', () => {
  ensureRust()

  const filePath = path.join(fixturesRoot, 'cantool-sample', 'src', 'lib.rs')
  const code = readFileSync(filePath, 'utf-8')

  const extractor = new RustExtractor()
  const sgRoot = parse('rust', code)
  const root = adaptRoot(sgRoot)
  const analysis = extractor.extractStructure(root)

  // Two public functions: parse_input, validate_config
  assert.equal(analysis.functions.length, 2)

  const parseInput = analysis.functions.find((f) => f.name === 'parse_input')
  assert.ok(parseInput)
  assert.ok(parseInput.params.includes('input'))

  const validateConfig = analysis.functions.find((f) => f.name === 'validate_config')
  assert.ok(validateConfig)

  // The test module is nested so its items are not top-level classes
  // No structs/traits at the top level of this fixture

  // Exports: only pub items
  assert.ok(analysis.exports.some((e) => e.name === 'parse_input'))
  assert.ok(analysis.exports.some((e) => e.name === 'validate_config'))
  assert.ok(!analysis.exports.some((e) => e.name?.startsWith('test_')))
})

// ---------------------------------------------------------------------------
// Extractor registry
// ---------------------------------------------------------------------------

test('getExtractor returns correct extractor for known languages', () => {
  const ts = getExtractor('typescript')
  assert.ok(ts)
  assert.ok(ts.languageIds.includes('typescript'))
  assert.ok(ts.languageIds.includes('javascript'))

  const js = getExtractor('javascript')
  assert.equal(js, ts)

  const rustExt = getExtractor('rust')
  assert.ok(rustExt)
  assert.ok(rustExt.languageIds.includes('rust'))

  const py = getExtractor('python')
  assert.ok(py)
  assert.ok(py.languageIds.includes('python'))

  const go = getExtractor('go')
  assert.ok(go)
  assert.ok(go.languageIds.includes('go'))

  // Unknown languages return undefined
  const unknown = getExtractor('elixir')
  assert.equal(unknown, undefined)
})

// ---------------------------------------------------------------------------
// Import resolver — TS/JS
// ---------------------------------------------------------------------------

test('resolveTsJsImport resolves relative imports', () => {
  const files = [
    'src/utils/helper.ts',
    'src/utils/format.ts',
    'src/index.ts',
    'tsconfig.json',
  ]
  const ctx = buildResolutionContext('/app', files)

  // Relative import from src/index.ts to ./utils/helper
  const resolved = resolveTsJsImport('./utils/helper', { path: 'src/index.ts' }, ctx)
  assert.ok(resolved)
  assert.equal(typeof resolved, 'string')
  assert.ok(resolved.includes('utils/helper'))

  // Same-directory relative import
  const resolved2 = resolveTsJsImport('./format', { path: 'src/utils/helper.ts' }, ctx)
  assert.ok(resolved2)
  assert.ok(resolved2.includes('utils/format'))

  // External package — returns null
  const resolved3 = resolveTsJsImport('lodash', { path: 'src/index.ts' }, ctx)
  assert.equal(resolved3, null)
})

test('resolveTsJsImport returns null for invalid inputs', () => {
  const files = ['src/index.ts']
  const ctx = buildResolutionContext('/app', files)

  assert.equal(resolveTsJsImport('', { path: 'src/index.ts' }, ctx), null)
  assert.equal(resolveTsJsImport(null, { path: 'src/index.ts' }, ctx), null)
})

test('buildResolutionContext builds expected structure', () => {
  const files = ['src/index.ts', 'src/lib.rs']
  const ctx = buildResolutionContext('/app', files)

  assert.ok(ctx)
  assert.equal(ctx.projectRoot, '/app')
  assert.ok(ctx.fileSet instanceof Set)
  assert.ok(ctx.tsConfigs instanceof Map)
  assert.ok(ctx.goModules instanceof Map)
  assert.ok(ctx.goFilesByDir instanceof Map)
})

// ---------------------------------------------------------------------------
// Extraction pipeline (integration)
// ---------------------------------------------------------------------------

test('runExtractionPipeline processes TypeScript fixture files', async () => {
  const rootDir = path.join(fixturesRoot, 'lsclaw-sample')
  const files = [
    path.join(rootDir, 'src', 'config.ts'),
    path.join(rootDir, 'src', 'index.ts'),
    path.join(rootDir, 'src', 'router.ts'),
  ]

  const result = await runExtractionPipeline({
    files,
    rootDir,
    deterministic: true,
  })

  assert.ok(result.callEdges.length > 0, 'should have call edges')
  assert.ok(Array.isArray(result.importsV2))
  assert.ok(result.structuralSummary)
  assert.ok(result.structuralSummary.total_functions > 0)
  assert.ok(result.structuralSummary.total_classes > 0)
  assert.equal(typeof result.structuralSummary.total_call_edges, 'number')
  assert.ok(result._stats.totalProcessed >= 1)
})

test('runExtractionPipeline processes Rust fixture files', async () => {
  const rootDir = path.join(fixturesRoot, 'cantool-sample')
  const files = [
    path.join(rootDir, 'src', 'lib.rs'),
    path.join(rootDir, 'src', 'main.rs'),
  ]

  const result = await runExtractionPipeline({
    files,
    rootDir,
    deterministic: true,
  })

  assert.ok(result.callEdges.length > 0, 'should have call edges')
  assert.ok(result.structuralSummary)
  assert.ok(result.structuralSummary.total_functions > 0)
  assert.ok(result._stats.totalProcessed >= 1)
})

test('runExtractionPipeline handles empty file list', async () => {
  const result = await runExtractionPipeline({
    files: [],
    rootDir: '/tmp',
    deterministic: true,
  })

  assert.equal(result.callEdges.length, 0)
  assert.equal(result.importsV2.length, 0)
  assert.ok(result.structuralSummary)
  assert.equal(result.structuralSummary.total_functions, 0)
  assert.equal(result._stats.totalProcessed, 0)
})

test('runExtractionPipeline skips unknown file types', async () => {
  const result = await runExtractionPipeline({
    files: ['/tmp/readme.md', '/tmp/notes.txt'],
    rootDir: '/tmp',
    deterministic: true,
  })

  assert.equal(result._stats.totalProcessed, 0)
  assert.equal(result._stats.totalParseFailures, 0)
})

test('runExtractionPipeline deterministic sort', async () => {
  const rootDir = path.join(fixturesRoot, 'lsclaw-sample')
  const files = [
    path.join(rootDir, 'src', 'config.ts'),
    path.join(rootDir, 'src', 'index.ts'),
  ]

  const result1 = await runExtractionPipeline({ files, rootDir, deterministic: true })
  const result2 = await runExtractionPipeline({ files, rootDir, deterministic: true })

  assert.deepEqual(
    result1.callEdges.map((e) => `${e.file}:${e.line}:${e.caller}:${e.callee}`),
    result2.callEdges.map((e) => `${e.file}:${e.line}:${e.caller}:${e.callee}`),
  )
})
