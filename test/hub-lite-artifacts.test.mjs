import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

test('hub-lite artifact export writes scan, symbols, and structure-map outputs', () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'los-ast-artifacts-'))
  const repoRoot = process.cwd()

  execFileSync(
    process.execPath,
    [
      './packages/cli/src/export-artifacts.mjs',
      '--root',
      './fixtures/golden/lsclaw-sample',
      '--project',
      'lsclaw',
      '--include',
      'src/**/*.ts',
      '--output-dir',
      outputDir,
      '--deterministic',
    ],
    {
      cwd: repoRoot,
      stdio: 'pipe',
    }
  )

  const scanFindings = readFileSync(join(outputDir, 'scan-findings.jsonl'), 'utf-8').trim()
  const symbols = JSON.parse(readFileSync(join(outputDir, 'symbols.json'), 'utf-8'))
  const structureMap = JSON.parse(readFileSync(join(outputDir, 'structure-map.json'), 'utf-8'))

  assert.ok(scanFindings.length > 0)
  assert.ok(Array.isArray(symbols))
  assert.equal(structureMap.schema, 'lsclaw.los-ast.structure-map.v1')
  assert.equal(structureMap.version, '1.0.0')
  assert.ok(Array.isArray(structureMap.files))
  assert.ok(Array.isArray(structureMap.symbols))
  assert.ok(Array.isArray(structureMap.imports))
  assert.ok(Array.isArray(structureMap.declares))
  assert.ok(Array.isArray(structureMap.route_declares))
  assert.ok(Array.isArray(structureMap.route_mounts))
  assert.ok(Array.isArray(structureMap.route_binds))
  assert.ok(Array.isArray(structureMap.route_runtime))
  assert.ok(Array.isArray(structureMap.route_runtime_deltas))
  assert.ok(structureMap.files.length > 0)
  assert.ok(structureMap.symbols.length > 0)
})

function writeFixtureFile(rootDir, relativePath, content) {
  const target = join(rootDir, relativePath)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content, 'utf-8')
}

test('hub-lite artifact export classifies page route contract and state files', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'los-ast-role-fixture-'))
  const outputDir = mkdtempSync(join(tmpdir(), 'los-ast-role-output-'))
  const repoRoot = process.cwd()

  writeFixtureFile(
    fixtureRoot,
    'src/admin/app/pages/ChatPage.tsx',
    `export function ChatPage() { return null }\n`
  )
  writeFixtureFile(
    fixtureRoot,
    'src/routes/chat.mjs',
    `export async function registerChat() {}\n`
  )
  writeFixtureFile(
    fixtureRoot,
    'src/shared/contracts/thread-types.ts',
    `export type Thread = { threadId: string }\n`
  )
  writeFixtureFile(
    fixtureRoot,
    'src/state/store.mjs',
    `export function getStore() { return null }\n`
  )

  execFileSync(
    process.execPath,
    [
      './packages/cli/src/export-artifacts.mjs',
      '--root',
      fixtureRoot,
      '--project',
      'custom',
      '--include',
      'src/**/*.ts',
      '--include',
      'src/**/*.tsx',
      '--include',
      'src/**/*.mjs',
      '--output-dir',
      outputDir,
      '--deterministic',
    ],
    {
      cwd: repoRoot,
      stdio: 'pipe',
    }
  )

  const structureMap = JSON.parse(readFileSync(join(outputDir, 'structure-map.json'), 'utf-8'))
  const fileRoles = Object.fromEntries(structureMap.files.map((item) => [item.path, item.role]))

  assert.equal(fileRoles['src/admin/app/pages/ChatPage.tsx'], 'page')
  assert.equal(fileRoles['src/routes/chat.mjs'], 'route')
  assert.equal(fileRoles['src/shared/contracts/thread-types.ts'], 'contract')
  assert.equal(fileRoles['src/state/store.mjs'], 'state')
})

test('hub-lite artifact export extracts minimal fastify route binds through register chains', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'los-ast-fastify-fixture-'))
  const outputDir = mkdtempSync(join(tmpdir(), 'los-ast-fastify-output-'))
  const repoRoot = process.cwd()

  writeFixtureFile(
    fixtureRoot,
    'src/server.ts',
    `import { apiRoutes } from './routes/index.js'

export async function buildServer(server) {
  await server.register(apiRoutes, { prefix: '/api' })
}
`
  )

  writeFixtureFile(
    fixtureRoot,
    'src/routes/index.ts',
    `export { default as apiRoutes } from './api.js'
`
  )

  writeFixtureFile(
    fixtureRoot,
    'src/routes/api.ts',
    `export default async function apiRoutes(fastify) {
  fastify.get('/users/:id', async () => ({ ok: true }))
  fastify.post('/users', async () => ({ created: true }))
}
`
  )

  execFileSync(
    process.execPath,
    [
      './packages/cli/src/export-artifacts.mjs',
      '--root',
      fixtureRoot,
      '--project',
      'custom',
      '--include',
      'src/**/*.ts',
      '--output-dir',
      outputDir,
      '--deterministic',
    ],
    {
      cwd: repoRoot,
      stdio: 'pipe',
    }
  )

  const structureMap = JSON.parse(readFileSync(join(outputDir, 'structure-map.json'), 'utf-8'))
  const routeDeclares = structureMap.route_declares.map((item) => `${item.method} ${item.path}`).sort()
  const routeMounts = structureMap.route_mounts.map((item) => ({
    target: item.target,
    resolvedPrefix: item.resolvedPrefix,
    level: item.level,
  }))
  const routeBinds = structureMap.route_binds.map((item) => `${item.method} ${item.path}`).sort()

  assert.deepEqual(routeDeclares, [
    'GET /users/:id',
    'POST /users',
  ].sort())
  assert.deepEqual(routeMounts, [
    {
      target: 'apiRoutes',
      resolvedPrefix: '/api',
      level: 'bound',
    },
  ])
  assert.deepEqual(routeBinds, [
    'GET /api/users/:id',
    'POST /api/users',
  ].sort())
  assert.equal(structureMap.route_binds[0].binding, 'runtime_like')
  assert.equal(structureMap.route_binds[0].framework, 'fastify')
  assert.equal(structureMap.route_binds[0].evidence.level, 'runtime_like')
  assert.equal(structureMap.route_binds[0].evidence.tier, 'core')
  assert.equal(structureMap.route_binds[0].evidence.activation.mode, 'always')
  assert.equal(structureMap.route_binds[0].via[0].target, 'apiRoutes')
})

test('hub-lite artifact export resolves route prefix config aliases and template prefixes', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'los-ast-dynamic-prefix-fixture-'))
  const outputDir = mkdtempSync(join(tmpdir(), 'los-ast-dynamic-prefix-output-'))
  const repoRoot = process.cwd()

  writeFixtureFile(
    fixtureRoot,
    'src/config/index.ts',
    `const routePrefixSchema = {
  default(value) { return value }
}

const configSchema = {
  ROUTE_PREFIX_EXPERIMENTAL: routePrefixSchema.default('/experimental'),
  ROUTE_PREFIX_VPS_AGENT_WEB: routePrefixSchema.default('/vps-agent-web'),
}

export const ROUTE_CONFIG = {
  prefixes: {
    experimental: configSchema.ROUTE_PREFIX_EXPERIMENTAL,
    vpsAgentWeb: configSchema.ROUTE_PREFIX_VPS_AGENT_WEB,
  },
}
`
  )

  writeFixtureFile(
    fixtureRoot,
    'src/routes/experimental/index.ts',
    `export { default as evidenceRoutes } from './evidence.js'
`
  )

  writeFixtureFile(
    fixtureRoot,
    'src/routes/experimental/evidence.ts',
    `export default async function evidenceRoutes(fastify) {
  fastify.get('/stats', async () => ({ ok: true }))
}
`
  )

  writeFixtureFile(
    fixtureRoot,
    'src/routes/vps.ts',
    `export default async function vpsRoutes(fastify) {
  fastify.get('/ping', async () => ({ ok: true }))
}
`
  )

  writeFixtureFile(
    fixtureRoot,
    'src/server.ts',
    `import { ROUTE_CONFIG } from './config/index.js'
import { evidenceRoutes } from './routes/experimental/index.js'
import vpsRoutes from './routes/vps.js'

export async function buildServer(server) {
  const exp = ROUTE_CONFIG.prefixes.experimental;
  const vps = ROUTE_CONFIG.prefixes.vpsAgentWeb;

  if (!ROUTE_CONFIG.enableExperimental) {
    return
  }
  await server.register(evidenceRoutes, { prefix: \`\${exp}/evidence\` })

  if (!ROUTE_CONFIG.enableVpsAgentWeb) {
    return
  }
  await server.register(vpsRoutes, { prefix: vps })
}
`
  )

  execFileSync(
    process.execPath,
    [
      './packages/cli/src/export-artifacts.mjs',
      '--root',
      fixtureRoot,
      '--project',
      'custom',
      '--include',
      'src/**/*.ts',
      '--output-dir',
      outputDir,
      '--deterministic',
    ],
    {
      cwd: repoRoot,
      stdio: 'pipe',
    }
  )

  const structureMap = JSON.parse(readFileSync(join(outputDir, 'structure-map.json'), 'utf-8'))
  const routeDeclares = structureMap.route_declares.map((item) => `${item.method} ${item.path}`).sort()
  const routeMounts = structureMap.route_mounts.map((item) => ({
    target: item.target,
    resolvedPrefix: item.resolvedPrefix,
    tierHint: item.tierHint,
    flag: item.activation.flag || null,
    source: item.activation.source || null,
  })).sort((a, b) => `${a.target}:${a.resolvedPrefix}`.localeCompare(`${b.target}:${b.resolvedPrefix}`))
  const routeBinds = structureMap.route_binds.map((item) => `${item.method} ${item.path}`).sort()

  assert.deepEqual(routeDeclares, [
    'GET /ping',
    'GET /stats',
  ])
  assert.deepEqual(routeMounts, [
    {
      target: 'evidenceRoutes',
      resolvedPrefix: '/experimental/evidence',
      tierHint: 'experimental',
      flag: 'ENABLE_EXPERIMENTAL_ROUTES',
      source: 'control_flow_guard',
    },
    {
      target: 'vpsRoutes',
      resolvedPrefix: '/vps-agent-web',
      tierHint: 'vps_agent_web',
      flag: 'ENABLE_VPS_AGENT_WEB_ROUTES',
      source: 'control_flow_guard',
    },
  ])
  assert.deepEqual(routeBinds, [
    'GET /experimental/evidence/stats',
    'GET /vps-agent-web/ping',
  ])
  const evidenceByPath = Object.fromEntries(
    structureMap.route_binds.map((item) => [item.path, item.evidence])
  )
  assert.equal(evidenceByPath['/experimental/evidence/stats'].tier, 'experimental')
  assert.equal(evidenceByPath['/experimental/evidence/stats'].activation.flag, 'ENABLE_EXPERIMENTAL_ROUTES')
  assert.equal(evidenceByPath['/experimental/evidence/stats'].activation.source, 'control_flow_guard')
  assert.equal(evidenceByPath['/vps-agent-web/ping'].tier, 'vps_agent_web')
  assert.equal(evidenceByPath['/vps-agent-web/ping'].activation.exposure, 'bridge')
  assert.equal(evidenceByPath['/vps-agent-web/ping'].activation.source, 'control_flow_guard')
})

test('hub-lite artifact export resolves alias guards and positive block guards for route activation', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'los-ast-guard-alias-fixture-'))
  const outputDir = mkdtempSync(join(tmpdir(), 'los-ast-guard-alias-output-'))
  const repoRoot = process.cwd()

  writeFixtureFile(
    fixtureRoot,
    'src/config/index.ts',
    `export const ROUTE_CONFIG = {
  enableExperimental: false,
  enableVpsAgentWeb: false,
  prefixes: {
    experimental: '/experimental',
    vpsAgentWeb: '/vps-agent-web',
  },
}
`
  )

  writeFixtureFile(
    fixtureRoot,
    'src/routes/experimental/evidence.ts',
    `export default async function evidenceRoutes(fastify) {
  fastify.get('/stats', async () => ({ ok: true }))
}
`
  )

  writeFixtureFile(
    fixtureRoot,
    'src/routes/vps.ts',
    `export default async function vpsRoutes(fastify) {
  fastify.get('/ping', async () => ({ ok: true }))
}
`
  )

  writeFixtureFile(
    fixtureRoot,
    'src/server.ts',
    `import { ROUTE_CONFIG } from './config/index.js'
import evidenceRoutes from './routes/experimental/evidence.js'
import vpsRoutes from './routes/vps.js'

export async function buildServer(server) {
  const experimentalEnabled = ROUTE_CONFIG.enableExperimental
  const vpsDisabled = !ROUTE_CONFIG.enableVpsAgentWeb

  if (experimentalEnabled) {
    await server.register(evidenceRoutes, { prefix: '/experimental' })
  }

  if (vpsDisabled) {
    return
  }
  await server.register(vpsRoutes, { prefix: '/vps-agent-web' })
}
`
  )

  execFileSync(
    process.execPath,
    [
      './packages/cli/src/export-artifacts.mjs',
      '--root',
      fixtureRoot,
      '--project',
      'custom',
      '--include',
      'src/**/*.ts',
      '--output-dir',
      outputDir,
      '--deterministic',
    ],
    {
      cwd: repoRoot,
      stdio: 'pipe',
    }
  )

  const structureMap = JSON.parse(readFileSync(join(outputDir, 'structure-map.json'), 'utf-8'))
  const mountByTarget = Object.fromEntries(
    structureMap.route_mounts.map((item) => [item.target, item])
  )
  const bindByPath = Object.fromEntries(
    structureMap.route_binds.map((item) => [item.path, item])
  )

  assert.equal(mountByTarget.evidenceRoutes.activation.flag, 'ENABLE_EXPERIMENTAL_ROUTES')
  assert.equal(mountByTarget.evidenceRoutes.activation.source, 'control_flow_guard')
  assert.equal(mountByTarget.evidenceRoutes.controlFlowGuard.kind, 'block')
  assert.equal(mountByTarget.evidenceRoutes.controlFlowGuard.condition, 'experimentalEnabled')
  assert.equal(mountByTarget.evidenceRoutes.controlFlowGuard.effectiveCondition, 'ROUTE_CONFIG.enableExperimental')

  assert.equal(mountByTarget.vpsRoutes.activation.flag, 'ENABLE_VPS_AGENT_WEB_ROUTES')
  assert.equal(mountByTarget.vpsRoutes.activation.source, 'control_flow_guard')
  assert.equal(mountByTarget.vpsRoutes.controlFlowGuard.kind, 'early_return')
  assert.equal(mountByTarget.vpsRoutes.controlFlowGuard.condition, 'vpsDisabled')
  assert.equal(mountByTarget.vpsRoutes.controlFlowGuard.effectiveCondition, 'ROUTE_CONFIG.enableVpsAgentWeb')

  assert.equal(bindByPath['/experimental/stats'].evidence.activation.flag, 'ENABLE_EXPERIMENTAL_ROUTES')
  assert.equal(bindByPath['/experimental/stats'].evidence.activation.guardExpression, 'experimentalEnabled')
  assert.equal(bindByPath['/vps-agent-web/ping'].evidence.activation.flag, 'ENABLE_VPS_AGENT_WEB_ROUTES')
  assert.equal(bindByPath['/vps-agent-web/ping'].evidence.activation.guardExpression, 'vpsDisabled')
})

test('hub-lite artifact export does not misclassify nested returns as route guards', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'los-ast-nested-return-fixture-'))
  const outputDir = mkdtempSync(join(tmpdir(), 'los-ast-nested-return-output-'))
  const repoRoot = process.cwd()

  writeFixtureFile(
    fixtureRoot,
    'src/routes/experimental/evidence.ts',
    `export default async function evidenceRoutes(fastify) {
  fastify.get('/stats', async () => ({ ok: true }))
}
`
  )

  writeFixtureFile(
    fixtureRoot,
    'src/server.ts',
    `import evidenceRoutes from './routes/experimental/evidence.js'

export async function buildServer(server) {
  if (server.hasDecorator('log')) {
    server.after(() => {
      return
    })
  }

  await server.register(evidenceRoutes, { prefix: '/experimental' })
}
`
  )

  execFileSync(
    process.execPath,
    [
      './packages/cli/src/export-artifacts.mjs',
      '--root',
      fixtureRoot,
      '--project',
      'custom',
      '--include',
      'src/**/*.ts',
      '--output-dir',
      outputDir,
      '--deterministic',
    ],
    {
      cwd: repoRoot,
      stdio: 'pipe',
    }
  )

  const structureMap = JSON.parse(readFileSync(join(outputDir, 'structure-map.json'), 'utf-8'))
  const mount = structureMap.route_mounts[0]
  const bind = structureMap.route_binds[0]

  assert.equal(mount.controlFlowGuard, null)
  assert.equal(mount.activation.mode, 'flag')
  assert.equal(mount.activation.flag, 'ENABLE_EXPERIMENTAL_ROUTES')
  assert.equal(mount.activation.source, undefined)
  assert.equal(bind.evidence.activation.mode, 'flag')
  assert.equal(bind.evidence.activation.source, undefined)
})

test('hub-lite artifact export resolves else-branch guards and simple compound guard shapes', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'los-ast-compound-guard-fixture-'))
  const outputDir = mkdtempSync(join(tmpdir(), 'los-ast-compound-guard-output-'))
  const repoRoot = process.cwd()

  writeFixtureFile(
    fixtureRoot,
    'src/config/index.ts',
    `export const ROUTE_CONFIG = {
  enableExperimental: false,
  enableVpsAgentWeb: false,
}
`
  )

  writeFixtureFile(
    fixtureRoot,
    'src/routes/experimental/evidence.ts',
    `export default async function evidenceRoutes(fastify) {
  fastify.get('/stats', async () => ({ ok: true }))
}
`
  )

  writeFixtureFile(
    fixtureRoot,
    'src/routes/experimental/preview.ts',
    `export default async function previewRoutes(fastify) {
  fastify.get('/feed', async () => ({ ok: true }))
}
`
  )

  writeFixtureFile(
    fixtureRoot,
    'src/routes/vps.ts',
    `export default async function vpsRoutes(fastify) {
  fastify.get('/ping', async () => ({ ok: true }))
}
`
  )

  writeFixtureFile(
    fixtureRoot,
    'src/server.ts',
    `import { ROUTE_CONFIG } from './config/index.js'
import evidenceRoutes from './routes/experimental/evidence.js'
import previewRoutes from './routes/experimental/preview.js'
import vpsRoutes from './routes/vps.js'

export async function buildServer(server) {
  const allowPreview = server.hasDecorator('preview')
  const maintenanceMode = server.hasDecorator('maintenance')

  if (!ROUTE_CONFIG.enableExperimental) {
    server.log.info('experimental disabled')
  } else {
    await server.register(evidenceRoutes, { prefix: '/experimental' })
  }

  if (ROUTE_CONFIG.enableExperimental && allowPreview) {
    await server.register(previewRoutes, { prefix: '/experimental-preview' })
  }

  if (!ROUTE_CONFIG.enableVpsAgentWeb || maintenanceMode) {
    return
  }
  await server.register(vpsRoutes, { prefix: '/vps-agent-web' })
}
`
  )

  execFileSync(
    process.execPath,
    [
      './packages/cli/src/export-artifacts.mjs',
      '--root',
      fixtureRoot,
      '--project',
      'custom',
      '--include',
      'src/**/*.ts',
      '--output-dir',
      outputDir,
      '--deterministic',
    ],
    {
      cwd: repoRoot,
      stdio: 'pipe',
    }
  )

  const structureMap = JSON.parse(readFileSync(join(outputDir, 'structure-map.json'), 'utf-8'))
  const mountByTarget = Object.fromEntries(
    structureMap.route_mounts.map((item) => [item.target, item])
  )

  assert.equal(mountByTarget.evidenceRoutes.controlFlowGuard.branch, 'else')
  assert.equal(mountByTarget.evidenceRoutes.controlFlowGuard.effectiveCondition, 'ROUTE_CONFIG.enableExperimental')
  assert.equal(mountByTarget.evidenceRoutes.activation.flag, 'ENABLE_EXPERIMENTAL_ROUTES')
  assert.equal(mountByTarget.evidenceRoutes.activation.source, 'control_flow_guard')

  assert.equal(mountByTarget.previewRoutes.controlFlowGuard.branch, 'if')
  assert.equal(mountByTarget.previewRoutes.activation.flag, 'ENABLE_EXPERIMENTAL_ROUTES')
  assert.equal(mountByTarget.previewRoutes.activation.guardShape, 'compound_and')
  assert.deepEqual(mountByTarget.previewRoutes.activation.additionalConditions, ['allowPreview'])

  assert.equal(mountByTarget.vpsRoutes.controlFlowGuard.branch, 'after_if')
  assert.equal(mountByTarget.vpsRoutes.activation.flag, 'ENABLE_VPS_AGENT_WEB_ROUTES')
  assert.equal(mountByTarget.vpsRoutes.activation.guardShape, 'compound_or')
  assert.deepEqual(mountByTarget.vpsRoutes.activation.additionalConditions, ['!maintenanceMode'])
})

test('hub-lite artifact export resolves else-if chains with inherited negated conditions', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'los-ast-elseif-guard-fixture-'))
  const outputDir = mkdtempSync(join(tmpdir(), 'los-ast-elseif-guard-output-'))
  const repoRoot = process.cwd()

  writeFixtureFile(
    fixtureRoot,
    'src/config/index.ts',
    `export const ROUTE_CONFIG = {
  enableExperimental: false,
  enableInternal: false,
}
`
  )

  writeFixtureFile(
    fixtureRoot,
    'src/routes/internal.ts',
    `export default async function internalRoutes(fastify) {
  fastify.get('/status', async () => ({ ok: true }))
}
`
  )

  writeFixtureFile(
    fixtureRoot,
    'src/server.ts',
    `import { ROUTE_CONFIG } from './config/index.js'
import internalRoutes from './routes/internal.js'

export async function buildServer(server) {
  if (ROUTE_CONFIG.enableExperimental) {
    server.log.info('experimental wins')
  } else if (ROUTE_CONFIG.enableInternal) {
    await server.register(internalRoutes, { prefix: '/internal' })
  }
}
`
  )

  execFileSync(
    process.execPath,
    [
      './packages/cli/src/export-artifacts.mjs',
      '--root',
      fixtureRoot,
      '--project',
      'custom',
      '--include',
      'src/**/*.ts',
      '--output-dir',
      outputDir,
      '--deterministic',
    ],
    {
      cwd: repoRoot,
      stdio: 'pipe',
    }
  )

  const structureMap = JSON.parse(readFileSync(join(outputDir, 'structure-map.json'), 'utf-8'))
  const mount = structureMap.route_mounts.find((item) => item.target === 'internalRoutes')
  const bind = structureMap.route_binds.find((item) => item.path === '/internal/status')

  assert.equal(mount.controlFlowGuard.branch, 'if')
  assert.equal(mount.controlFlowGuard.effectiveCondition, '!ROUTE_CONFIG.enableExperimental && ROUTE_CONFIG.enableInternal')
  assert.equal(mount.activation.flag, 'ENABLE_INTERNAL_ROUTES')
  assert.equal(mount.activation.guardShape, 'compound_and')
  assert.deepEqual(mount.activation.additionalConditions, ['!ROUTE_CONFIG.enableExperimental'])

  assert.equal(bind.evidence.activation.flag, 'ENABLE_INTERNAL_ROUTES')
  assert.equal(bind.evidence.activation.guardShape, 'compound_and')
  assert.deepEqual(bind.evidence.activation.additionalConditions, ['!ROUTE_CONFIG.enableExperimental'])
})

test('hub-lite artifact export resolves wrapped compound if conditions', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'los-ast-wrapped-guard-fixture-'))
  const outputDir = mkdtempSync(join(tmpdir(), 'los-ast-wrapped-guard-output-'))
  const repoRoot = process.cwd()

  writeFixtureFile(
    fixtureRoot,
    'src/config/index.ts',
    `export const ROUTE_CONFIG = {
  enableExperimental: false,
}
`
  )

  writeFixtureFile(
    fixtureRoot,
    'src/routes/wrapped.ts',
    `export default async function wrappedRoutes(fastify) {
  fastify.get('/wrapped', async () => ({ ok: true }))
}
`
  )

  writeFixtureFile(
    fixtureRoot,
    'src/server.ts',
    `import { ROUTE_CONFIG } from './config/index.js'
import wrappedRoutes from './routes/wrapped.js'

export async function buildServer(server) {
  const allowPreview = server.hasDecorator('preview')

  if ((ROUTE_CONFIG.enableExperimental) && allowPreview) {
    await server.register(wrappedRoutes, { prefix: '/experimental' })
  }
}
`
  )

  execFileSync(
    process.execPath,
    [
      './packages/cli/src/export-artifacts.mjs',
      '--root',
      fixtureRoot,
      '--project',
      'custom',
      '--include',
      'src/**/*.ts',
      '--output-dir',
      outputDir,
      '--deterministic',
    ],
    {
      cwd: repoRoot,
      stdio: 'pipe',
    }
  )

  const structureMap = JSON.parse(readFileSync(join(outputDir, 'structure-map.json'), 'utf-8'))
  const mount = structureMap.route_mounts.find((item) => item.target === 'wrappedRoutes')

  assert.equal(mount.controlFlowGuard.condition, '(ROUTE_CONFIG.enableExperimental) && allowPreview')
  assert.equal(mount.controlFlowGuard.effectiveCondition, 'ROUTE_CONFIG.enableExperimental && allowPreview')
  assert.equal(mount.activation.flag, 'ENABLE_EXPERIMENTAL_ROUTES')
  assert.equal(mount.activation.guardShape, 'compound_and')
  assert.deepEqual(mount.activation.additionalConditions, ['allowPreview'])
})

test('hub-lite artifact export resolves same-file helper guard forwarding', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'los-ast-helper-guard-fixture-'))
  const outputDir = mkdtempSync(join(tmpdir(), 'los-ast-helper-guard-output-'))
  const repoRoot = process.cwd()

  writeFixtureFile(
    fixtureRoot,
    'src/config/index.ts',
    `export const ROUTE_CONFIG = {
  enableExperimental: false,
  enableVpsAgentWeb: false,
}
`
  )

  writeFixtureFile(
    fixtureRoot,
    'src/routes/preview.ts',
    `export default async function previewRoutes(fastify) {
  fastify.get('/feed', async () => ({ ok: true }))
}
`
  )

  writeFixtureFile(
    fixtureRoot,
    'src/routes/vps.ts',
    `export default async function vpsRoutes(fastify) {
  fastify.get('/ping', async () => ({ ok: true }))
}
`
  )

  writeFixtureFile(
    fixtureRoot,
    'src/server.ts',
    `import { ROUTE_CONFIG } from './config/index.js'
import previewRoutes from './routes/preview.js'
import vpsRoutes from './routes/vps.js'

function shouldMountPreview(experimentalEnabled, allowPreview) {
  return experimentalEnabled && allowPreview
}

function shouldSkipVps(vpsEnabled, maintenanceMode) {
  return !vpsEnabled || maintenanceMode
}

export async function buildServer(server) {
  const allowPreview = server.hasDecorator('preview')
  const maintenanceMode = server.hasDecorator('maintenance')

  if (shouldMountPreview(ROUTE_CONFIG.enableExperimental, allowPreview)) {
    await server.register(previewRoutes, { prefix: '/experimental-preview' })
  }

  if (shouldSkipVps(ROUTE_CONFIG.enableVpsAgentWeb, maintenanceMode)) {
    return
  }
  await server.register(vpsRoutes, { prefix: '/vps-agent-web' })
}
`
  )

  execFileSync(
    process.execPath,
    [
      './packages/cli/src/export-artifacts.mjs',
      '--root',
      fixtureRoot,
      '--project',
      'custom',
      '--include',
      'src/**/*.ts',
      '--output-dir',
      outputDir,
      '--deterministic',
    ],
    {
      cwd: repoRoot,
      stdio: 'pipe',
    }
  )

  const structureMap = JSON.parse(readFileSync(join(outputDir, 'structure-map.json'), 'utf-8'))
  const mountByTarget = Object.fromEntries(
    structureMap.route_mounts.map((item) => [item.target, item])
  )

  assert.equal(mountByTarget.previewRoutes.controlFlowGuard.condition, 'shouldMountPreview(ROUTE_CONFIG.enableExperimental, allowPreview)')
  assert.equal(mountByTarget.previewRoutes.controlFlowGuard.effectiveCondition, 'ROUTE_CONFIG.enableExperimental && allowPreview')
  assert.equal(mountByTarget.previewRoutes.activation.flag, 'ENABLE_EXPERIMENTAL_ROUTES')
  assert.equal(mountByTarget.previewRoutes.activation.guardShape, 'compound_and')
  assert.deepEqual(mountByTarget.previewRoutes.activation.additionalConditions, ['allowPreview'])

  assert.equal(mountByTarget.vpsRoutes.controlFlowGuard.condition, 'shouldSkipVps(ROUTE_CONFIG.enableVpsAgentWeb, maintenanceMode)')
  assert.equal(mountByTarget.vpsRoutes.controlFlowGuard.resolvedCondition, '!ROUTE_CONFIG.enableVpsAgentWeb || maintenanceMode')
  assert.equal(mountByTarget.vpsRoutes.activation.flag, 'ENABLE_VPS_AGENT_WEB_ROUTES')
  assert.equal(mountByTarget.vpsRoutes.activation.guardShape, 'compound_or')
  assert.deepEqual(mountByTarget.vpsRoutes.activation.additionalConditions, ['!maintenanceMode'])
})

test('hub-lite artifact export does not expand unsafe helper guards', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'los-ast-unsafe-helper-fixture-'))
  const outputDir = mkdtempSync(join(tmpdir(), 'los-ast-unsafe-helper-output-'))
  const repoRoot = process.cwd()

  writeFixtureFile(
    fixtureRoot,
    'src/config/index.ts',
    `export const ROUTE_CONFIG = {
  enableExperimental: false,
}
`
  )

  writeFixtureFile(
    fixtureRoot,
    'src/routes/unsafe.ts',
    `export default async function unsafeRoutes(fastify) {
  fastify.get('/unsafe', async () => ({ ok: true }))
}
`
  )

  writeFixtureFile(
    fixtureRoot,
    'src/server.ts',
    `import { ROUTE_CONFIG } from './config/index.js'
import unsafeRoutes from './routes/unsafe.js'

function helperWithSideEffect(experimentalEnabled, allowPreview) {
  return experimentalEnabled && hasPreviewAccess(allowPreview)
}

function helperWithMultipleStatements(experimentalEnabled) {
  const ready = experimentalEnabled
  return ready
}

export async function buildServer(server) {
  const allowPreview = server.hasDecorator('preview')

  if (helperWithSideEffect(ROUTE_CONFIG.enableExperimental, allowPreview)) {
    await server.register(unsafeRoutes, { prefix: '/experimental' })
  }

  if (helperWithMultipleStatements(ROUTE_CONFIG.enableExperimental)) {
    await server.register(unsafeRoutes, { prefix: '/experimental-multi' })
  }
}
`
  )

  execFileSync(
    process.execPath,
    [
      './packages/cli/src/export-artifacts.mjs',
      '--root',
      fixtureRoot,
      '--project',
      'custom',
      '--include',
      'src/**/*.ts',
      '--output-dir',
      outputDir,
      '--deterministic',
    ],
    {
      cwd: repoRoot,
      stdio: 'pipe',
    }
  )

  const structureMap = JSON.parse(readFileSync(join(outputDir, 'structure-map.json'), 'utf-8'))
  const mounts = structureMap.route_mounts.filter((item) => item.target === 'unsafeRoutes')
  const sideEffectMount = mounts.find((item) => item.resolvedPrefix === '/experimental')
  const multiStatementMount = mounts.find((item) => item.resolvedPrefix === '/experimental-multi')

  assert.equal(sideEffectMount.controlFlowGuard.condition, 'helperWithSideEffect(ROUTE_CONFIG.enableExperimental, allowPreview)')
  assert.equal(sideEffectMount.controlFlowGuard.effectiveCondition, 'helperWithSideEffect(ROUTE_CONFIG.enableExperimental, allowPreview)')
  assert.equal(sideEffectMount.activation.flag, 'ENABLE_EXPERIMENTAL_ROUTES')
  assert.equal(sideEffectMount.activation.source, undefined)

  assert.equal(multiStatementMount.controlFlowGuard.condition, 'helperWithMultipleStatements(ROUTE_CONFIG.enableExperimental)')
  assert.equal(multiStatementMount.controlFlowGuard.effectiveCondition, 'helperWithMultipleStatements(ROUTE_CONFIG.enableExperimental)')
  assert.equal(multiStatementMount.activation.flag, 'ENABLE_EXPERIMENTAL_ROUTES')
  assert.equal(multiStatementMount.activation.source, undefined)
})

test('hub-lite artifact export probes los-ast api runtime routes using actual default route wiring', () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'los-ast-runtime-output-'))
  const repoRoot = process.cwd()

  execFileSync(
    process.execPath,
    [
      './packages/cli/src/export-artifacts.mjs',
      '--root',
      '.',
      '--project',
      'custom',
      '--include',
      'packages/api/src/**/*.ts',
      '--output-dir',
      outputDir,
      '--deterministic',
    ],
    {
      cwd: repoRoot,
      stdio: 'pipe',
    }
  )

  const structureMap = JSON.parse(readFileSync(join(outputDir, 'structure-map.json'), 'utf-8'))
  const runtimeRoutes = structureMap.route_runtime.map((item) => `${item.method} ${item.path}`)
  const runtimeDeltas = Object.fromEntries(
    structureMap.route_runtime_deltas.map((item) => [`${item.method} ${item.path}`, item])
  )

  assert.ok(runtimeRoutes.includes('POST /scan'))
  assert.ok(!runtimeRoutes.includes('POST /experimental/evidence/generate'))
  assert.ok(!runtimeRoutes.includes('GET /vps-agent-web/approvals'))
  assert.equal(structureMap.route_runtime.find((item) => item.path === '/scan').level, 'runtime')
  assert.equal(structureMap.route_binds.find((item) => item.path === '/experimental/evidence/generate').evidence.activation.source, 'control_flow_guard')
  assert.equal(runtimeDeltas['POST /scan'].relation, 'exact_match')
  assert.equal(runtimeDeltas['POST /experimental/evidence/generate'], undefined)
})

test('hub-lite artifact export probes los-ast api runtime routes with enabled flags', () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'los-ast-runtime-enabled-output-'))
  const repoRoot = process.cwd()

  execFileSync(
    process.execPath,
    [
      './packages/cli/src/export-artifacts.mjs',
      '--root',
      '.',
      '--project',
      'custom',
      '--include',
      'packages/api/src/**/*.ts',
      '--output-dir',
      outputDir,
      '--deterministic',
    ],
    {
      cwd: repoRoot,
      stdio: 'pipe',
      env: {
        ...process.env,
        ENABLE_EXPERIMENTAL_ROUTES: 'true',
        ENABLE_VPS_AGENT_WEB_ROUTES: 'true',
      },
    }
  )

  const structureMap = JSON.parse(readFileSync(join(outputDir, 'structure-map.json'), 'utf-8'))
  const runtimeRoutes = structureMap.route_runtime.map((item) => `${item.method} ${item.path}`)
  const runtimeDeltas = Object.fromEntries(
    structureMap.route_runtime_deltas.map((item) => [`${item.method} ${item.path}`, item])
  )

  assert.ok(runtimeRoutes.includes('POST /experimental/evidence/generate'))
  assert.ok(runtimeRoutes.includes('GET /vps-agent-web/approvals'))
  assert.equal(structureMap.route_runtime.find((item) => item.path === '/experimental/evidence/generate').activation.flag, 'ENABLE_EXPERIMENTAL_ROUTES')
  assert.deepEqual(runtimeDeltas['HEAD /experimental/approvals'].reasons, ['auto_head'])
  assert.deepEqual(runtimeDeltas['HEAD /experimental/approvals/'].reasons.sort(), ['auto_head', 'trailing_slash_variant'].sort())
  assert.equal(structureMap.route_runtime.find((item) => item.method === 'HEAD' && item.path === '/experimental/approvals/').delta.relation, 'runtime_variant')
})
