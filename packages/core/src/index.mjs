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
export {
  discoverFiles,
  scan,
  fix,
  explainAtPosition,
  DEFAULT_EXCERPT_LENGTH,
  EXPLAIN_EXCERPT_LENGTH,
  PARSE_FAILURE_SAMPLE_LIMIT,
} from './runner.mjs'
export { toJsonLines, toMarkdownFix, toMarkdownScan } from './report.mjs'
export {
  createParseCache,
  defaultParseCache,
  DEFAULT_PARSE_CACHE_MAX_ENTRIES,
} from './parse-cache.mjs'

// Scanner modules (scan planner + chunked map-reduce)
export { ScanMode, planScan, determineMode, chunkByCost, getParserWeight, estimateFileCosts } from './scanner/scan-planner.mjs'
export { scanChunk } from './scanner/chunked-scanner.mjs'
export { reduceChunks, buildDedupKey } from './scanner/reducer.mjs'
export { executeParallel } from './scanner/parallel-executor.mjs'
export { reconcile } from './scanner/reconciliation.mjs'
export { IntermediateStore, FilesystemIntermediateStore, createIntermediateStore } from './scanner/intermediate-store.mjs'

// 默认初始化（向后兼容）
initializeCore().catch(console.error);
