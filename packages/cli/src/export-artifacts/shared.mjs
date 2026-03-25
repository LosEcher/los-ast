import path from 'node:path'

import {
  ROUTE_BINDS_LIMITATION_NOTE,
  normalizeRoutePath,
} from '../source-structure-extractor.mjs'

export function parseExportArtifactsArgs(argv) {
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

export function normalizeComparableRoutePath(routePath) {
  const normalizedPath = normalizeRoutePath('', routePath)
  if (normalizedPath.length > 1) {
    return normalizedPath.replace(/\/+$/, '')
  }
  return normalizedPath
}

export function buildRouteRuntimeDeltas(routeBinds, routeRuntime, deterministic) {
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

export function attachRouteRuntimeDeltas(routeRuntime, routeRuntimeDeltas) {
  return routeRuntime.map((runtimeRoute) => ({
    ...runtimeRoute,
    delta: routeRuntimeDeltas.find((item) => item.method === runtimeRoute.method && item.path === runtimeRoute.path) || null,
  }))
}

export function buildStructureMapArtifact({
  project,
  rootDir,
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
}) {
  return {
    schema: 'lsclaw.los-ast.structure-map.v1',
    version: '1.0.0',
    project,
    rootDir,
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
}

export function buildExportArtifactsSummary({
  project,
  rootDir,
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
}) {
  return {
    ok: true,
    project,
    rootDir,
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
}
