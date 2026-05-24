import path from 'node:path'

import { getProjectAdapter, listProjects } from '@los-ast/adapters'
import { loadRuleFiles } from '@los-ast/core'

export function normalizeArray(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.flatMap((v) => String(v).split(',')).map((s) => s.trim()).filter(Boolean)
  return String(value).split(',').map((s) => s.trim()).filter(Boolean)
}

export async function resolveWorkspace(options, settings = {}) {
  const preferProjectAdapter = settings.preferProjectAdapter === true

  if (options.project && options.project !== 'custom' && (preferProjectAdapter || !options.root)) {
    const adapter = getProjectAdapter(options.project)
    return {
      project: adapter.project,
      rootDir: adapter.rootDir,
      include: normalizeArray(options.include).length ? normalizeArray(options.include) : adapter.include,
      ignore: normalizeArray(options.ignore).length ? normalizeArray(options.ignore) : adapter.ignore,
      ruleGlobs: adapter.ruleGlobs,
      languages: adapter.languages || [],
      experimentalExtractors: adapter.experimentalExtractors || false,
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

export async function resolveRules(options, settings = {}) {
  const ws = await resolveWorkspace(options, settings)
  const explicitPatterns = normalizeArray(options.rules)
  return loadRuleFiles([...ws.ruleGlobs, ...explicitPatterns])
}
