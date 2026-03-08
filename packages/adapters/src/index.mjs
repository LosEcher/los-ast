import path from 'node:path'
import fs from 'node:fs'

// 默认项目配置（向后兼容）
const DEFAULT_PROJECTS = {
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

// 配置文件路径（按优先级）
const CONFIG_PATHS = [
  'los-ast.config.json',
  '.los-ast.json',
  '.config/los-ast.json',
]

/**
 * 加载外部配置文件
 * @returns {Object} 外部配置对象
 */
function loadExternalConfig() {
  const cwd = process.cwd()

  for (const configPath of CONFIG_PATHS) {
    const fullPath = path.resolve(cwd, configPath)
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8')
        return JSON.parse(content)
      } catch (error) {
        console.warn(`[adapters] Failed to load config from ${configPath}:`, error.message)
      }
    }
  }

  return { projects: {} }
}

/**
 * 从环境变量获取项目路径
 * @param {string} projectName - 项目名称
 * @returns {string | null} 环境变量中的路径或 null
 */
function getPathFromEnv(projectName) {
  const envKey = `LOS_AST_PROJECT_${projectName.toUpperCase()}_ROOT`
  return process.env[envKey] || null
}

/**
 * 解析项目根目录路径
 * 优先级: 环境变量 > 外部配置 > 默认配置
 * @param {string} projectName - 项目名称
 * @param {string} defaultPath - 默认路径
 * @returns {string} 解析后的绝对路径
 * @throws {Error} 当路径无法解析或不存在时
 */
function resolveProjectRoot(projectName, defaultPath) {
  // 优先级1: 环境变量
  const envPath = getPathFromEnv(projectName)
  if (envPath) {
    const resolved = path.resolve(envPath)
    if (fs.existsSync(resolved)) {
      return resolved
    }
    console.warn(`[adapters] Environment variable path does not exist: ${resolved}`)
  }

  // 优先级2: 外部配置文件
  const externalConfig = loadExternalConfig()
  if (externalConfig.projects?.[projectName]?.rootDir) {
    const configPath = externalConfig.projects[projectName].rootDir
    const resolved = path.isAbsolute(configPath)
      ? configPath
      : path.resolve(process.cwd(), configPath)
    if (fs.existsSync(resolved)) {
      return resolved
    }
    console.warn(`[adapters] Config file path does not exist: ${resolved}`)
  }

  // 优先级3: 默认配置
  const resolvedDefault = path.resolve(defaultPath)
  if (fs.existsSync(resolvedDefault)) {
    return resolvedDefault
  }

  // 路径不存在，抛出友好错误
  const envKey = `LOS_AST_PROJECT_${projectName.toUpperCase()}_ROOT`
  throw new Error(
    `Project "${projectName}" path does not exist: ${resolvedDefault}\n\n` +
    `To use this project adapter, you have several options:\n\n` +
    `1. Set environment variable:\n` +
    `   export ${envKey}=/path/to/${projectName}\n\n` +
    `2. Create los-ast.config.json in your working directory:\n` +
    `   {\n` +
    `     "projects": {\n` +
    `       "${projectName}": {\n` +
    `         "rootDir": "/path/to/${projectName}"\n` +
    `       }\n` +
    `     }\n` +
    `   }\n\n` +
    `3. Use --root mode instead of --project:\n` +
    `   los-ast scan --root /your/project/path --include "**/*.ts"\n\n` +
    `Supported project adapters: ${listProjects().join(', ')}`
  )
}

/**
 * 合并外部配置覆盖
 * @param {string} projectName - 项目名称
 * @param {Object} defaultConfig - 默认配置
 * @returns {Object} 合并后的配置
 */
function mergeExternalConfig(projectName, defaultConfig) {
  const externalConfig = loadExternalConfig()
  const externalProject = externalConfig.projects?.[projectName]

  if (!externalProject) {
    return defaultConfig
  }

  return {
    ...defaultConfig,
    ...externalProject,
    // rootDir 需要特殊处理（已经在 resolveProjectRoot 中解析）
  }
}

/**
 * 创建完全自定义的项目适配器
 * @param {string} projectName - 项目名称
 * @param {Object} config - 外部配置
 * @returns {Object} 项目适配器
 */
function createCustomAdapter(projectName, config) {
  const rootDir = path.isAbsolute(config.rootDir)
    ? config.rootDir
    : path.resolve(process.cwd(), config.rootDir)

  if (!fs.existsSync(rootDir)) {
    throw new Error(
      `Custom project "${projectName}" path does not exist: ${rootDir}\n` +
      `Please check your los-ast.config.json configuration.`
    )
  }

  return {
    project: projectName,
    rootDir,
    include: config.include || ['**/*'],
    ignore: config.ignore || ['**/node_modules/**', '**/.git/**'],
    ruleGlobs: config.ruleGlobs || [],
  }
}

export function listProjects() {
  const externalConfig = loadExternalConfig()
  const externalProjects = Object.keys(externalConfig.projects || {})
  const defaultProjects = Object.keys(DEFAULT_PROJECTS)

  // 去重合并
  return [...new Set([...defaultProjects, ...externalProjects])]
}

export function getProjectAdapter(projectName) {
  const key = String(projectName || '').trim()

  // 检查是否为完全自定义的项目（不在默认配置中）
  const externalConfig = loadExternalConfig()
  if (!DEFAULT_PROJECTS[key] && externalConfig.projects?.[key]) {
    return createCustomAdapter(key, externalConfig.projects[key])
  }

  // 获取默认配置
  const defaultConfig = DEFAULT_PROJECTS[key]
  if (!defaultConfig) {
    throw new Error(
      `Unknown project: "${projectName}"\n` +
      `Supported projects: ${listProjects().join(', ')}\n\n` +
      `To add a custom project, create los-ast.config.json:\n` +
      `{\n` +
      `  "projects": {\n` +
      `    "myproject": {\n` +
      `      "rootDir": "./path/to/project",\n` +
      `      "include": ["src/**/*.{ts,tsx}"],\n` +
      `      "ignore": ["node_modules/**"]\n` +
      `    }\n` +
      `  }\n` +
      `}`
    )
  }

  // 解析根目录路径（支持环境变量和外部配置覆盖）
  const resolvedRootDir = resolveProjectRoot(key, defaultConfig.rootDir)

  // 合并外部配置（允许覆盖 include/ignore/ruleGlobs）
  const mergedConfig = mergeExternalConfig(key, defaultConfig)

  return {
    ...mergedConfig,
    rootDir: resolvedRootDir,
  }
}
