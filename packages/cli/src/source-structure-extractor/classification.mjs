import path from 'node:path'

export const ROUTE_BINDS_LIMITATION_NOTE =
  'route_binds currently provides minimal Fastify literal-only runtime-like bind evidence; it is not full route truth'

export function normalizeRoutePath(prefix = '', routePath = '') {
  const rawPrefix = String(prefix || '').trim()
  const rawRoute = String(routePath || '').trim()

  if (!rawPrefix && !rawRoute) return '/'
  if (!rawPrefix) return rawRoute.startsWith('/') ? rawRoute : `/${rawRoute}`
  if (!rawRoute || rawRoute === '/') return rawPrefix || '/'

  const normalizedPrefix = rawPrefix === '/' ? '' : rawPrefix.replace(/\/+$/, '')
  const normalizedRoute = rawRoute.replace(/^\/+/, '')
  const combined = `${normalizedPrefix}/${normalizedRoute}`.replace(/\/{2,}/g, '/')
  return combined.startsWith('/') ? combined : `/${combined}`
}

export function classifyRouteTier(routePath) {
  const normalizedPath = normalizeRoutePath('', routePath)
  if (normalizedPath.startsWith('/experimental')) return 'experimental'
  if (normalizedPath.startsWith('/internal')) return 'internal'
  if (normalizedPath.startsWith('/vps-agent-web')) return 'vps_agent_web'
  return 'core'
}

export function classifyRouteActivation(routePath) {
  const tier = classifyRouteTier(routePath)
  if (tier === 'experimental') {
    return {
      mode: 'flag',
      flag: 'ENABLE_EXPERIMENTAL_ROUTES',
      default: false,
    }
  }

  if (tier === 'internal') {
    return {
      mode: 'flag',
      flag: 'ENABLE_INTERNAL_ROUTES',
      default: false,
    }
  }

  if (tier === 'vps_agent_web') {
    return {
      mode: 'flag',
      flag: 'ENABLE_VPS_AGENT_WEB_ROUTES',
      default: false,
      exposure: 'bridge',
    }
  }

  return {
    mode: 'always',
    default: true,
  }
}

export function toPosixRelative(rootDir, filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/')
}

export function inferRouteSourceTier(filePath) {
  const normalizedPath = String(filePath || '').split(path.sep).join('/')
  if (normalizedPath.includes('/routes/experimental/')) return 'experimental'
  if (normalizedPath.includes('/routes/vps-agent-web/')) return 'vps_agent_web'
  if (normalizedPath.includes('/routes/core/') || normalizedPath.includes('/plugins/health-check')) return 'core'
  return 'unknown'
}

export function buildRouteEvidence(routePath, mountChain) {
  const lastMount = Array.isArray(mountChain) && mountChain.length > 0
    ? mountChain[mountChain.length - 1]
    : null
  return {
    level: 'runtime_like',
    sources: [
      'declared_route_literal',
      'register_chain_bound',
    ],
    tier: classifyRouteTier(routePath),
    activation: lastMount?.activation || classifyRouteActivation(routePath),
    mountDepth: Array.isArray(mountChain) ? mountChain.length : 0,
  }
}

export function classifyFileRole(relativeFile) {
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
