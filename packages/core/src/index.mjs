import { registerLanguages } from './languages.mjs'

/**
 * Core Façade 版本
 * @version 1.0.0
 */
export const CORE_FACADE_VERSION = '1.0.0';

// 追踪 Core 加载状态
let coreReady = false;

/**
 * 初始化 Core 模块
 * 加载语言、规则等
 */
export async function initializeCore() {
  // 注册语言
  registerLanguages();

  // 可以添加其他初始化逻辑
  // 如加载默认规则文件等

  coreReady = true;
}

/**
 * 检查 Core 是否已加载完成
 * @returns {boolean}
 */
export function isReady() {
  return coreReady;
}

// 导出原有模块
export { registerLanguages, languageFromFilePath } from './languages.mjs'
export { loadRuleFiles } from './rules.mjs'
export { discoverFiles, scan, fix, explainAtPosition } from './runner.mjs'
export { toJsonLines, toMarkdownFix, toMarkdownScan } from './report.mjs'
export { createParseCache, defaultParseCache } from './parse-cache.mjs'

// 默认初始化（向后兼容）
initializeCore().catch(console.error);
