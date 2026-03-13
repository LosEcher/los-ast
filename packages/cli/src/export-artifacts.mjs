import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  discoverFiles,
  scan,
  toJsonLines,
} from '@los-ast/core'

import {
  ROUTE_BINDS_LIMITATION_NOTE,
  classifyRouteActivation,
  classifyRouteTier,
  extractSourceStructure,
  normalizeRoutePath,
} from './source-structure-extractor.mjs'
import { resolveRules, resolveWorkspace } from './workspace-options.mjs'

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

function normalizeComparableRoutePath(routePath) {
  const normalizedPath = normalizeRoutePath('', routePath)
  if (normalizedPath.length > 1) {
    return normalizedPath.replace(/\/+$/, '')
  }
  return normalizedPath
}

function buildRouteRuntimeDeltas(routeBinds, routeRuntime, deterministic) {
  const bindByKey = new Map()
  const bindByNormalizedKey = new Map()

  for (const bind of routeBinds) {
    const key = `${bind.method}:${bind.path}`
    if (!bindByKey.has(key)) {
      bindByKey.set(key, bind)
    }

    const normalizedKey = `${bind.method}:${normalizeComparableRoutePath(bind.path)}`
    if (!bindByNormalizedKey.has(normalizedKey)) {
      bindByNormalizedKey.set(normalizedKey, bind)
    }
  }

  const runtimeDeltas = routeRuntime.map((runtimeRoute) => {
    const reasons = []
    const exactKey = `${runtimeRoute.method}:${runtimeRoute.path}`
    const normalizedPath = normalizeComparableRoutePath(runtimeRoute.path)
    const normalizedKey = `${runtimeRoute.method}:${normalizedPath}`

    const exactBind = bindByKey.get(exactKey) || null
    const normalizedBind = bindByNormalizedKey.get(normalizedKey) || null
    let matchedBind = exactBind || normalizedBind

    if (exactBind) {
      return {
        method: runtimeRoute.method,
        path: runtimeRoute.path,
        relation: 'exact_match',
        reasons,
        matchedBind: {
          method: exactBind.method,
          path: exactBind.path,
          file: exactBind.file,
        },
      }
    }

    if (normalizedBind && normalizedBind.path !== runtimeRoute.path) {
      reasons.push('trailing_slash_variant')
    }

    if (runtimeRoute.method === 'HEAD') {
      const getBind = bindByNormalizedKey.get(`GET:${normalizedPath}`) || bindByKey.get(`GET:${runtimeRoute.path}`) || null
      if (getBind) {
        matchedBind = matchedBind || getBind
        reasons.push('auto_head')
        if (runtimeRoute.path !== normalizedPath && !reasons.includes('trailing_slash_variant')) {
          reasons.push('trailing_slash_variant')
        }
      }
    }

    return {
      method: runtimeRoute.method,
      path: runtimeRoute.path,
      relation: reasons.length > 0 ? 'runtime_variant' : 'runtime_only',
      reasons,
      matchedBind: matchedBind ? {
        method: matchedBind.method,
        path: matchedBind.path,
        file: matchedBind.file,
      } : null,
    }
  })

  if (deterministic) {
    runtimeDeltas.sort((a, b) => `${a.path}:${a.method}`.localeCompare(`${b.path}:${b.method}`))
  }

  return runtimeDeltas
}

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
  const routeRuntimeWithDeltas = routeRuntime.map((runtimeRoute) => ({
    ...runtimeRoute,
    delta: routeRuntimeDeltas.find((item) => item.method === runtimeRoute.method && item.path === runtimeRoute.path) || null,
  }))

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
    route_declares: routeDeclares,
    route_mounts: routeMounts,
    route_binds: routeBinds,
    route_runtime: routeRuntimeWithDeltas,
    route_runtime_deltas: routeRuntimeDeltas,
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
      routeDeclares: routeDeclares.length,
      routeMounts: routeMounts.length,
      routeBinds: routeBinds.length,
      routeRuntime: routeRuntimeWithDeltas.length,
      routeRuntimeDeltas: routeRuntimeDeltas.length,
    },
    limitations: routeBinds.length > 0
      ? [
        ROUTE_BINDS_LIMITATION_NOTE,
      ]
      : [
        ROUTE_BINDS_LIMITATION_NOTE,
        'route_binds may remain empty when the workspace does not expose literal Fastify route registrations or register-chain evidence',
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
