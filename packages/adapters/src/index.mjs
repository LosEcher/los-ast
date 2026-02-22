import path from 'node:path'

const PROJECTS = {
  cantool: {
    project: 'cantool',
    rootDir: '/Users/echerlos/Downloads/projects/cantool',
    include: [
      'src-tauri/src/**/*.rs',
      'src-tauri/tests/**/*.rs',
      'frontend/src/**/*.{ts,tsx,js,jsx}',
      'scripts/**/*.rs',
    ],
    ignore: ['**/node_modules/**', '**/target/**', '**/dist/**', '**/.git/**'],
    ruleGlobs: ['rules/projects/cantool/**/*.{yml,yaml}', 'rules/languages/rust/**/*.{yml,yaml}', 'rules/languages/typescript/**/*.{yml,yaml}', 'rules/languages/tsx/**/*.{yml,yaml}'],
  },
  lsclaw: {
    project: 'lsclaw',
    rootDir: '/Users/echerlos/Downloads/projects/lsclaw',
    include: ['control-plane/src/**/*.{mjs,js,ts}', 'control-plane/scripts/**/*.{mjs,js,ts}', 'config/**/*.{json,md}'],
    ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    ruleGlobs: ['rules/projects/lsclaw/**/*.{yml,yaml}', 'rules/languages/**/*.{yml,yaml}'],
  },
  fullstackframe: {
    project: 'fullstackframe',
    rootDir: '/Users/echerlos/Downloads/projects/fullstackframe',
    include: [
      'admin-framework/backend/src/**/*.{ts,js}',
      'admin-framework/backend/test/**/*.{ts,js}',
      'admin-framework/frontend/src/**/*.{ts,tsx,js,jsx}',
      'admin-framework/frontend/test/**/*.{ts,tsx,js,jsx}',
    ],
    ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    ruleGlobs: ['rules/projects/fullstackframe/**/*.{yml,yaml}', 'rules/languages/**/*.{yml,yaml}'],
  },
}

export function listProjects() {
  return Object.keys(PROJECTS)
}

export function getProjectAdapter(projectName) {
  const key = String(projectName || '').trim()
  const adapter = PROJECTS[key]
  if (!adapter) {
    throw new Error(`unknown project: ${projectName}. supported: ${listProjects().join(', ')}`)
  }
  return {
    ...adapter,
    rootDir: path.resolve(adapter.rootDir),
  }
}

