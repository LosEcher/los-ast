/**
 * Core API 共享类型定义
 * @version 1.0.0
 */

// === Scope 定义 (硬约束 #3) ===

export interface Scope {
  /** 租户ID */
  tenant_id?: string;
  /** 项目ID */
  project_id?: string;
  /** 执行者ID */
  actor_id?: string;
  /** 本地模式 (仅开发环境) */
  mode?: 'local' | 'service';
}

// === 扫描相关类型 ===

export interface ScanParams {
  scope: Scope;
  project: string;
  rootDir: string;
  include?: string[];
  ignore?: string[];
  includeStats?: boolean;
}

export interface Range {
  start: { line: number; column: number; index: number };
  end: { line: number; column: number; index: number };
}

export interface Finding {
  tool: 'los-ast';
  version: number;
  timestamp: string;
  project: string;
  ruleFile: string | null;
  ruleId: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  file: string;
  language: string;
  range: Range;
  excerpt: string;
  hasFix: boolean;
  proposedReplacement: string | null;
  fingerprint: string;
}

export interface ScanResult {
  filesScanned: number;
  findings: Finding[];
  parseCache?: {
    hits: number;
    misses: number;
    size: number;
  };
}

// === 符号发现相关类型 ===

export interface DiscoverParams {
  scope: Scope;
  rootDir: string;
  include?: string[];
  ignore?: string[];
  limit?: number;
}

export interface SymbolInfo {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'variable' | 'type';
  file: string;
  range: Range;
}

export interface SymbolResult {
  symbols: SymbolInfo[];
  total: number;
  truncated: boolean;
}

// === 错误类型 ===

export type ErrorCategory =
  | 'VALIDATION'
  | 'SCOPE'
  | 'TIMEOUT'
  | 'SCAN_TOO_LARGE'
  | 'NOT_FOUND'
  | 'INTERNAL';

export interface ApiError {
  category: ErrorCategory;
  code: string;
  message: string;
  requestId: string;
  timestamp: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

// === 健康检查类型 ===

export interface HealthStatus {
  status: 'alive' | 'ready' | 'unavailable';
  timestamp: string;
  version?: string;
}

// === 扫描限制配置 ===

export interface ScanLimits {
  maxFilesPerSyncScan: number;
  maxResponseBytes: number;
  maxDurationMs: number;
}
