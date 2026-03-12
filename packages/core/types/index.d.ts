/**
 * Core Façade 版本
 */
export declare const CORE_FACADE_VERSION: string;
export declare const DEFAULT_EXCERPT_LENGTH: number;
export declare const EXPLAIN_EXCERPT_LENGTH: number;
export declare const PARSE_FAILURE_SAMPLE_LIMIT: number;
export declare const DEFAULT_PARSE_CACHE_MAX_ENTRIES: number;

/**
 * 初始化 Core 模块
 * 加载语言、规则等
 */
export declare function initializeCore(): Promise<void>;

/**
 * 检查 Core 是否已加载完成
 */
export declare function isReady(): boolean;

// 语言模块
export declare function registerLanguages(): void;
export declare function languageFromFilePath(filePath: string): string | null;

// 规则模块
export interface RuleFile {
  rules: Rule[];
}

export interface Rule {
  id: string;
  name?: string;
  rule: {
    pattern?: string;
    kind?: string;
    regex?: string;
    [key: string]: unknown;
  };
  message: string;
  severity: 'error' | 'warning' | 'info';
  language: string;
  fix?: {
    replace: string;
    joinBy?: string;
  };
  constraints?: Array<{
    name: string;
    regex: string;
    flags?: string;
    mode?: 'any' | 'all';
  }>;
  ruleFile?: string;
  __file?: string;
}

export declare function loadRuleFiles(ruleGlobs: string[]): Promise<Rule[]>;

// 范围类型
export interface Position {
  line: number;
  column: number;
  index: number;
}

export interface Range {
  start: Position;
  end: Position;
}

// 扫描模块
export interface ScanOptions {
  project?: string;
  rootDir: string;
  include?: string[];
  ignore?: string[];
  includeStats?: boolean;
  signal?: AbortSignal;
  rules?: Rule[];
  deterministic?: boolean;
}

export interface Finding {
  tool: string;
  version: number;
  timestamp: string;
  project: string;
  ruleFile: string | null;
  ruleId: string;
  findingSource?: 'ast' | 'contract' | 'schema';
  governanceDomain?: string[] | null;
  impactHint?: 'low' | 'medium' | 'high' | null;
  severity: 'error' | 'warning' | 'info';
  message: string;
  file: string;
  language: string;
  range: Range;
  excerpt: string;
  hasFix: boolean;
  proposedReplacement: string | null;
  diff?: string | null;
  applied?: boolean;
  fingerprint: string;
}

export interface ParseCacheStats {
  hits: number;
  misses: number;
  entries: number;
  maxEntries: number;
}

export interface ParseFailureSample {
  file: string;
  language: string;
  error: string;
}

export interface ParseFailureStats {
  count: number;
  sampleLimit: number;
  truncated: boolean;
  byLanguage: Record<string, number>;
  samples: ParseFailureSample[];
}

export interface ScanTelemetry {
  durationMs: number;
  mode: 'ast' | 'native_only' | 'hybrid';
  explicitRulePatterns: number;
  loadedRules: number;
  estimatedFiles?: number;
  nativeInputs: {
    openApiDocuments: number;
    openApiComparisons: number;
    schemaDocuments: number;
    schemaComparisons: number;
    contractArtifacts: number;
    schemaArtifacts: number;
  };
}

export interface ScanResult {
  filesScanned: number;
  findings: Finding[];
  parseCache?: ParseCacheStats;
  parseFailures?: ParseFailureStats;
  scanTelemetry?: ScanTelemetry;
}

export declare function discoverFiles(options: {
  rootDir: string;
  include?: string[];
  ignore?: string[];
}): Promise<string[]>;

export declare function scan(options: ScanOptions): Promise<ScanResult>;

// Fix 模块
export interface FixOptions {
  project?: string;
  rootDir: string;
  include?: string[];
  ignore?: string[];
  rules?: Rule[];
  dryRun?: boolean;
  apply?: boolean;
  maxChanges?: number;
  parseCache?: ParseCache;
  includeStats?: boolean;
  deterministic?: boolean;
}

export interface FixResultItem {
  tool: string;
  version: number;
  timestamp: string;
  project: string;
  ruleFile: string | null;
  ruleId: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  file: string;
  language: string;
  range: Range;
  excerpt: string;
  hasFix: boolean;
  proposedReplacement: string;
  diff?: string;
  applied: boolean;
  fingerprint: string;
}

export interface FixResult {
  filesScanned: number;
  changesApplied: number;
  results: FixResultItem[];
  parseCache?: ParseCacheStats;
}

export declare function fix(options: FixOptions): Promise<FixResult>;

// Explain 模块
export interface ExplainOptions {
  file: string;
  line: number;
  column: number;
  rootDir: string;
  rules?: Rule[];
  parseCache?: ParseCache;
  includeStats?: boolean;
  deterministic?: boolean;
}

export interface MatchInfo {
  ruleFile: string | null;
  ruleId: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  range: Range;
  excerpt: string;
  fingerprint: string;
}

export interface ExplainResult {
  rootDir: string;
  file: string;
  language: string;
  position: {
    line: number;
    column: number;
  };
  matches: MatchInfo[];
  parseCache?: ParseCacheStats;
}

export declare function explainAtPosition(options: ExplainOptions): Promise<ExplainResult>;

// 报告模块
export declare function toJsonLines(records: unknown[], deterministic?: boolean): string;
export declare function toMarkdownFix(result: FixResult): string;
export declare function toMarkdownScan(result: ScanResult): string;

// 解析缓存模块
export interface ParseCache {
  parseFile(filePath: string, language: string, options?: { cacheAst?: boolean }): Promise<{ root: unknown; source: string }>;
  invalidateFile(filePath: string): void;
  snapshotStats(): ParseCacheStats;
}

export declare function createParseCache(options?: { maxEntries?: number }): ParseCache;
export declare const defaultParseCache: ParseCache;
