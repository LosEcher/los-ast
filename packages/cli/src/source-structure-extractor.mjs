import fs from 'node:fs/promises'

import { languageFromFilePath } from '@los-ast/core'

import { classifyActivationFromGuard, extractRouteRegistrations } from './route-guard-analysis.mjs'
import {
  ROUTE_BINDS_LIMITATION_NOTE,
  TEXT_IMPORT_PATTERNS,
  TEXT_SYMBOL_PATTERNS,
  buildRouteEvidence,
  classifyFileRole,
  classifyRouteActivation,
  classifyRouteTier,
  extractConstBindings,
  extractDeclaredRoutes,
  extractDetailedImports,
  extractDetailedReexports,
  extractRoutePrefixDefaults,
  extractWithPatterns,
  inferRouteSourceTier,
  normalizeRoutePath,
  resolveImportedModule,
  resolveLocalModule,
  resolveStaticExpression,
  toPosixRelative,
} from './source-structure-extractor/shared.mjs'

export {
  ROUTE_BINDS_LIMITATION_NOTE,
  classifyRouteActivation,
  classifyRouteTier,
  normalizeRoutePath,
}
from './source-structure-extractor/shared.mjs'

export async function extractSourceStructure({ files, rootDir, deterministic }) {
  const structureFiles = []
  const structureSymbols = []
  const structureImports = []
  const structureDeclares = []
  const moduleInfos = new Map()

  for (const file of files) {
    const facts = await extractFileFacts(file, rootDir)
    structureFiles.push(facts.file)
    structureSymbols.push(...facts.symbols)
    structureImports.push(...facts.imports)
    structureDeclares.push(...facts.declares)
    if (facts.module) {
      moduleInfos.set(facts.module.file.path, facts.module)
    }
  }

  const routeDeclares = buildRouteDeclares(moduleInfos, deterministic)
  const routeMounts = buildRouteMounts(moduleInfos, deterministic)
  const routeBinds = buildRouteBinds(moduleInfos, deterministic)

  if (deterministic) {
    structureFiles.sort((a, b) => String(a.path).localeCompare(String(b.path)))
    structureSymbols.sort((a, b) => `${a.file}:${a.name}:${a.kind}`.localeCompare(`${b.file}:${b.name}:${b.kind}`))
    structureImports.sort((a, b) => `${a.from}:${a.to}:${a.kind}`.localeCompare(`${b.from}:${b.to}:${b.kind}`))
    structureDeclares.sort((a, b) => `${a.file}:${a.symbol}:${a.kind}`.localeCompare(`${b.file}:${b.symbol}:${b.kind}`))
  }

  return {
    structureFiles,
    structureSymbols,
    structureImports,
    structureDeclares,
    routeDeclares,
    routeMounts,
    routeBinds,
  }
}

function buildRouteDeclares(moduleInfos, deterministic) {
  const routeDeclares = []

  for (const info of moduleInfos.values()) {
    for (const declaredRoute of info.declaredRoutes) {
      routeDeclares.push({
        framework: 'fastify',
        level: 'declared',
        method: declaredRoute.method,
        path: declaredRoute.path,
        file: declaredRoute.file,
        line: declaredRoute.line,
        sourceTierHint: inferRouteSourceTier(declaredRoute.file),
      })
    }
  }

  if (deterministic) {
    routeDeclares.sort((a, b) => `${a.path}:${a.method}:${a.file}:${a.line}`.localeCompare(`${b.path}:${b.method}:${b.file}:${b.line}`))
  }

  return routeDeclares
}

function buildRouteMounts(moduleInfos, deterministic) {
  const availableFiles = new Set(moduleInfos.keys())
  const routeMounts = []

  for (const info of moduleInfos.values()) {
    for (const registration of info.registers) {
      const resolvedPrefix = resolveStaticExpression(
        registration.prefixExpression,
        info,
        moduleInfos,
        availableFiles
      )
      const targetFile = resolveImportedModule(info, registration.target, moduleInfos, availableFiles)
      const tierSource = resolvedPrefix || registration.prefixExpression || ''
      const guardActivation = classifyActivationFromGuard(registration.controlFlowGuard)
      const activation = guardActivation || classifyRouteActivation(tierSource)

      routeMounts.push({
        framework: 'fastify',
        level: 'bound',
        file: info.file.path,
        line: registration.line,
        target: registration.target,
        targetFile,
        prefixExpression: registration.prefixExpression || '',
        resolvedPrefix: resolvedPrefix || null,
        sourceTierHint: inferRouteSourceTier(info.file.path),
        tierHint: classifyRouteTier(tierSource),
        activation,
        controlFlowGuard: registration.controlFlowGuard,
      })
    }
  }

  if (deterministic) {
    routeMounts.sort((a, b) => `${a.file}:${a.target}:${a.resolvedPrefix || a.prefixExpression}:${a.line}`.localeCompare(`${b.file}:${b.target}:${b.resolvedPrefix || b.prefixExpression}:${b.line}`))
  }

  return routeMounts
}

function buildRouteBinds(moduleInfos, deterministic) {
  const availableFiles = new Set(moduleInfos.keys())
  const importedByCounts = new Map()

  for (const [moduleFile, info] of moduleInfos.entries()) {
    importedByCounts.set(moduleFile, importedByCounts.get(moduleFile) || 0)
    for (const importEntry of info.imports) {
      const targetFile = resolveLocalModule(moduleFile, importEntry.specifier, availableFiles)
      if (!targetFile) continue
      importedByCounts.set(targetFile, (importedByCounts.get(targetFile) || 0) + 1)
    }
  }

  const rootModules = [...moduleInfos.values()]
    .filter((info) => info.registers.length > 0 && (importedByCounts.get(info.file.path) || 0) === 0)
    .map((info) => info.file.path)

  const routeBinds = []
  const seen = new Set()

  function visit(moduleFile, prefix = '', mountChain = []) {
    const visitKey = `${moduleFile}|${prefix}|${mountChain.map((step) => `${step.file}:${step.target}:${step.prefix}`).join('>')}`
    if (seen.has(`visit:${visitKey}`)) return
    seen.add(`visit:${visitKey}`)

    const info = moduleInfos.get(moduleFile)
    if (!info) return

    for (const declaredRoute of info.declaredRoutes) {
      const resolvedPath = normalizeRoutePath(prefix, declaredRoute.path)
      const bind = {
        framework: 'fastify',
        binding: 'runtime_like',
        method: declaredRoute.method,
        path: resolvedPath,
        declaredPath: declaredRoute.path,
        file: declaredRoute.file,
        line: declaredRoute.line,
        via: mountChain,
        evidence: buildRouteEvidence(resolvedPath, mountChain),
      }
      const bindKey = `${bind.method}|${bind.path}|${bind.file}|${bind.line}|${JSON.stringify(bind.via)}`
      if (seen.has(bindKey)) continue
      seen.add(bindKey)
      routeBinds.push(bind)
    }

    for (const registration of info.registers) {
      const resolvedPrefix = resolveStaticExpression(
        registration.prefixExpression,
        info,
        moduleInfos,
        availableFiles
      )
      const targetFile = resolveImportedModule(info, registration.target, moduleInfos, availableFiles)
      if (!targetFile) continue
      const guardActivation = classifyActivationFromGuard(registration.controlFlowGuard)
      const activation = guardActivation || classifyRouteActivation(resolvedPrefix || registration.prefixExpression || '')
      visit(
        targetFile,
        normalizeRoutePath(prefix, resolvedPrefix || registration.prefixExpression || ''),
        [...mountChain, {
          file: info.file.path,
          target: registration.target,
          prefix: resolvedPrefix || registration.prefixExpression || '/',
          line: registration.line,
          activation,
          controlFlowGuard: registration.controlFlowGuard,
        }]
      )
    }
  }

  for (const rootModule of rootModules) {
    visit(rootModule, '', [])
  }

  if (deterministic) {
    routeBinds.sort((a, b) => `${a.path}:${a.method}:${a.file}:${a.line}`.localeCompare(`${b.path}:${b.method}:${b.file}:${b.line}`))
  }

  return routeBinds
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
      module: null,
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

  const module = ['typescript', 'javascript', 'tsx', 'jsx'].includes(normalizedLanguage)
    ? {
      file: {
        path: relativeFile,
      },
      imports: extractDetailedImports(source),
      reexports: extractDetailedReexports(source),
      constBindings: extractConstBindings(source),
      routePrefixDefaults: extractRoutePrefixDefaults(source),
      declaredRoutes: extractDeclaredRoutes(source, relativeFile),
      registers: extractRouteRegistrations(source),
    }
    : null

  return {
    file: {
      path: relativeFile,
      language: normalizedLanguage,
      role: classifyFileRole(relativeFile),
    },
    symbols,
    imports,
    declares,
    module,
  }
}
