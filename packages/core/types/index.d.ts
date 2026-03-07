/**
 * Core Façade 版本
 */
export declare const CORE_FACADE_VERSION: string;

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
  name: string;
  pattern: string;
  message?: string;
}

export declare function loadRuleFiles(ruleDir: string): Promise<Rule[]>;

// 扫描模块
export interface ScanOptions {
  project?: string;
  rootDir: string;
  include?: string[];
  ignore?: string[];
  includeStats?: boolean;
  signal?: AbortSignal;
}

export interface Finding {
  filePath: string;
  line: number;
  column: number;
  message: string;
  rule: string;
  severity: 'error' | 'warning' | 'info';
}

export interface ScanResult {
  findings: Finding[];
  stats: {
    filesScanned: number;
    durationMs: number;
  };
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
}

export interface FixResult {
  fixedFiles: string[];
  errors: string[];
}

export declare function fix(options: FixOptions): Promise<FixResult>;

// Explain 模块
export interface ExplainOptions {
  filePath: string;
  line: number;
  column: number;
  rootDir: string;
}

export interface ExplainResult {
  explanation: string;
  symbols?: SymbolInfo[];
}

export interface SymbolInfo {
  name: string;
  kind: string;
  location: {
    file: string;
    line: number;
    column: number;
  };
}

export declare function explainAtPosition(options: ExplainOptions): Promise<ExplainResult>;

// 报告模块
export declare function toJsonLines(result: ScanResult): string;
export declare function toMarkdownFix(result: FixResult): string;
export declare function toMarkdownScan(result: ScanResult): string;

// 解析缓存模块
export interface ParseCache {
  get(filePath: string): unknown | undefined;
  set(filePath: string, value: unknown): void;
  clear(): void;
}

export declare function createParseCache(): ParseCache;
export declare const defaultParseCache: ParseCache;
