/**
 * Core API 共享类型定义
 * @version 1.0.0
 */

export interface Scope {
  tenant_id?: string;
  project_id?: string;
  actor_id?: string;
  mode?: 'local' | 'service';
}

export interface VerifiedScope {
  tenant_id: string;
  project_id: string;
  actor_id: string;
  mode: 'local' | 'service';
  identity_verified: boolean;
  identity_source: 'jwt' | 'service_token' | 'local_dev';
}

// === 扫描相关类型 ===

export interface ScanParams {
  scope: Scope;
  project: string;
  rootDir?: string;
  include?: string[];
  ignore?: string[];
  rules?: string[];
  rulePack?: string;
  includeStats?: boolean;
  deterministic?: boolean;
  openApiDocuments?: OpenApiDocumentInput[];
  openApiComparisons?: OpenApiComparisonInput[];
  schemaDocuments?: SchemaDocumentInput[];
  schemaComparisons?: SchemaComparisonInput[];
  contractArtifacts?: ContractArtifactFindingInput[];
  schemaArtifacts?: SchemaArtifactFindingInput[];
}

export interface OpenApiDocumentInput {
  source?: string;
  file?: string;
  content: string;
  format?: 'yaml' | 'json';
}

export interface OpenApiComparisonInput {
  source?: string;
  file?: string;
  baseline: string;
  current: string;
  format?: 'yaml' | 'json';
}

export interface SchemaDocumentInput {
  source?: string;
  file?: string;
  content: string;
  format?: 'sql' | 'prisma';
}

export interface SchemaComparisonInput {
  source?: string;
  file?: string;
  baseline: string;
  current: string;
  format?: 'sql' | 'prisma';
}

export interface ContractArtifactFindingInput {
  source?: string;
  ruleId?: string;
  severity?: 'info' | 'warning' | 'error';
  message?: string;
  file?: string;
  language?: string;
  line?: number;
  column?: number;
  startIndex?: number;
  endIndex?: number;
  excerpt?: string;
  governanceDomain?: string | string[];
  impactHint?: 'low' | 'medium' | 'high';
  range?: {
    start: { line: number; column: number; index: number };
    end: { line: number; column: number; index: number };
  };
}

export interface SchemaArtifactFindingInput extends ContractArtifactFindingInput {}

export interface Range {
  start: { line: number; column: number; index: number };
  end: { line: number; column: number; index: number };
}

export type FindingSource = 'ast' | 'contract' | 'schema';

export interface Finding {
  tool: 'los-ast';
  version: number;
  timestamp: string;
  project: string;
  ruleFile: string | null;
  ruleId: string;
  findingSource?: FindingSource;
  governanceDomain?: string[] | null;
  impactHint?: 'low' | 'medium' | 'high' | null;
  severity: 'info' | 'warning' | 'error';
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

export interface ScanResult {
  filesScanned: number;
  findings: Finding[];
  parseCache?: {
    hits: number;
    misses: number;
    entries: number;
    maxEntries: number;
  };
  parseFailures?: {
    count: number;
    sampleLimit: number;
    truncated: boolean;
    byLanguage: Record<string, number>;
    samples: Array<{
      file: string;
      language: string;
      error: string;
    }>;
  };
  scanTelemetry?: {
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
  | 'AUTHENTICATION'
  | 'TIMEOUT'
  | 'SCAN_TOO_LARGE'
  | 'NOT_FOUND'
  | 'SERVICE_UNAVAILABLE'
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
