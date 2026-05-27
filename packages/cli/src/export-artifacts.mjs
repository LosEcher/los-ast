import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  discoverFiles,
  scan,
  toJsonLines,
} from '@los-ast/core'

import {
  classifyRouteActivation,
  classifyRouteTier,
  extractSourceStructure,
} from './source-structure-extractor.mjs'
import {
  attachRouteRuntimeDeltas,
  buildExportArtifactsSummary,
  buildRouteRuntimeDeltas,
  buildStructureMapArtifact,
  parseExportArtifactsArgs,
} from './export-artifacts/shared.mjs'
import { resolveRules, resolveWorkspace } from './workspace-options.mjs'
import { runExtractionPipeline } from './extraction-pipeline.mjs'

async function probeLosAstApiRuntimeRoutes(rootDir, deterministic) {
  const distServer = path.join(rootDir, 'packages', 'api', 'dist', 'server.js')
  const distCoreIndex = path.join(rootDir, 'packages', 'api', 'dist', 'routes', 'core', 'index.js')
  const distExperimentalIndex = path.join(rootDir, 'packages', 'api', 'dist', 'routes', 'experimental', 'index.js')
  const distVpsIndex = path.join(rootDir, 'packages', 'api', 'dist', 'routes', 'vps-agent-web', 'index.js')
  const distHealthCheck = path.join(rootDir, 'packages', 'api', 'dist', 'plugins', 'health-check.js')
  const distCancellation = path.join(rootDir, 'packages', 'api', 'dist', 'plugins', 'cancellation.js')
  const distConfig = path.join(rootDir, 'packages', 'api', 'dist', 'config', 'index.js')

  const requiredFiles = [distServer, distCoreIndex, distExperimentalIndex, distVpsIndex, distHealthCheck, distCancellation, distConfig]
  for (const file of requiredFiles) {
    try {
      await fs.access(file)
    } catch {
      return []
    }
  }

  const FastifyModule = await import('fastify')
  const Fastify = FastifyModule.default
  const [
    { default: healthCheckPlugin },
    { default: cancellationPlugin },
    coreIndex,
    experimentalIndex,
    { default: vpsAgentWebRoutes },
    configModule,
  ] = await Promise.all([
    import(pathToFileURL(distHealthCheck).href),
    import(pathToFileURL(distCancellation).href),
    import(pathToFileURL(distCoreIndex).href),
    import(pathToFileURL(distExperimentalIndex).href),
    import(pathToFileURL(distVpsIndex).href),
    import(pathToFileURL(distConfig).href),
  ])

  const runtimeRoutes = []
  const app = Fastify({ logger: false })
  app.addHook('onRoute', (routeOptions) => {
    const methods = Array.isArray(routeOptions.method) ? routeOptions.method : [routeOptions.method]
    for (const method of methods) {
      runtimeRoutes.push({
        framework: 'fastify',
        level: 'runtime',
        probe: 'los_ast_api_dist_wiring_onRoute',
        method: String(method || '').toUpperCase(),
        path: routeOptions.url,
        routePath: routeOptions.routePath,
        prefix: routeOptions.prefix,
        tier: classifyRouteTier(routeOptions.url),
        activation: classifyRouteActivation(routeOptions.url),
      })
    }
  })

  try {
    await app.register(healthCheckPlugin)
    await app.register(cancellationPlugin)
    await app.register(coreIndex.scanRoutes, { prefix: '/scan' })
    await app.register(coreIndex.discoverRoutes, { prefix: '/discover' })

    const routeConfig = configModule.ROUTE_CONFIG || {}
    if (routeConfig.enableExperimental) {
      const experimentalPrefix = routeConfig.prefixes?.experimental || '/experimental'
      await app.register(experimentalIndex.memoryProposalsRoutes, { prefix: `${experimentalPrefix}/memory-proposals` })
      await app.register(experimentalIndex.incidentRoutes, { prefix: `${experimentalPrefix}/incidents` })
      await app.register(experimentalIndex.attributionRoutes, { prefix: `${experimentalPrefix}/attribution` })
      await app.register(experimentalIndex.recoveryRoutes, { prefix: `${experimentalPrefix}/recovery` })
      await app.register(experimentalIndex.approvalRoutes, { prefix: `${experimentalPrefix}/approvals` })
      await app.register(experimentalIndex.hotReloadRoutes, { prefix: `${experimentalPrefix}/hotreload` })
      await app.register(experimentalIndex.evidenceRoutes, { prefix: `${experimentalPrefix}/evidence` })
    }

    if (routeConfig.enableVpsAgentWeb) {
      const vpsPrefix = routeConfig.prefixes?.vpsAgentWeb || '/vps-agent-web'
      await app.register(vpsAgentWebRoutes, { prefix: vpsPrefix })
    }
    await app.ready()
  } finally {
    await app.close().catch(() => {})
  }

  const uniqueRoutes = []
  const seen = new Set()
  for (const route of runtimeRoutes) {
    const key = `${route.method}:${route.path}`
    if (seen.has(key)) continue
    seen.add(key)
    uniqueRoutes.push(route)
  }

  if (deterministic) {
    uniqueRoutes.sort((a, b) => `${a.path}:${a.method}`.localeCompare(`${b.path}:${b.method}`))
  }

  return uniqueRoutes
}

async function exportArtifacts(options) {
  const ws = await resolveWorkspace(options)
  const rules = await resolveRules(options)
  const outputDir = path.resolve(options.outputDir || path.join(ws.rootDir, 'logs', 'hub-lite-artifacts'))
  const deterministic = Boolean(options.deterministic)

  const controller = new AbortController()
  const onAbort = () => { controller.abort() }
  process.once('SIGINT', onAbort)
  process.once('SIGTERM', onAbort)

  let scanResult
  try {
    scanResult = await scan({
      project: ws.project,
      rootDir: ws.rootDir,
      include: ws.include,
      ignore: ws.ignore,
      rules,
      deterministic,
      signal: controller.signal,
    })
  } finally {
    process.removeListener('SIGINT', onAbort)
    process.removeListener('SIGTERM', onAbort)
  }

  const files = await discoverFiles({
    rootDir: ws.rootDir,
    include: ws.include,
    ignore: ws.ignore,
  })

  const {
    structureFiles,
    structureSymbols,
    structureImports,
    structureDeclares,
    routeDeclares,
    routeMounts,
    routeBinds,
  } = await extractSourceStructure({
    files,
    rootDir: ws.rootDir,
    deterministic,
  })

  const routeRuntime = await probeLosAstApiRuntimeRoutes(ws.rootDir, deterministic)
  const routeRuntimeDeltas = buildRouteRuntimeDeltas(routeBinds, routeRuntime, deterministic)
  const routeRuntimeWithDeltas = attachRouteRuntimeDeltas(routeRuntime, routeRuntimeDeltas)

  // Phase 5: Experimental Tree-sitter extraction pipeline
  let callEdges = []
  let importsV2 = []
  let structuralSummary = null
  if (options.experimentalExtractors || ws.experimentalExtractors) {
    const extractionResult = await runExtractionPipeline({
      files,
      rootDir: ws.rootDir,
      deterministic,
    })
    callEdges = extractionResult.callEdges
    importsV2 = extractionResult.importsV2
    structuralSummary = extractionResult.structuralSummary
  }

  const structureMap = buildStructureMapArtifact({
    project: ws.project,
    rootDir: ws.rootDir,
    deterministic,
    structureFiles,
    structureSymbols,
    structureImports,
    structureDeclares,
    routeDeclares,
    routeMounts,
    routeBinds,
    routeRuntimeWithDeltas,
    routeRuntimeDeltas,
    callEdges,
    importsV2,
    structuralSummary,
  })

  await fs.mkdir(outputDir, { recursive: true })
  await fs.writeFile(path.join(outputDir, 'scan-findings.jsonl'), toJsonLines(scanResult.findings, deterministic), 'utf-8')
  await fs.writeFile(path.join(outputDir, 'symbols.json'), `${JSON.stringify(structureSymbols, null, 2)}\n`, 'utf-8')
  await fs.writeFile(path.join(outputDir, 'structure-map.json'), `${JSON.stringify(structureMap, null, 2)}\n`, 'utf-8')

  const summary = buildExportArtifactsSummary({
    project: ws.project,
    rootDir: ws.rootDir,
    outputDir,
    scanResult,
    structureFiles,
    structureSymbols,
    structureImports,
    structureDeclares,
    routeDeclares,
    routeMounts,
    routeBinds,
    routeRuntimeWithDeltas,
    routeRuntimeDeltas,
    callEdges,
    importsV2,
    structuralSummary,
  })
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

const args = parseExportArtifactsArgs(process.argv.slice(2))
exportArtifacts(args).catch((error) => {
  process.stderr.write(`${error?.stack || error?.message || String(error)}\n`)
  process.exit(1)
})
