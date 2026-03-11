import { existsSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { scanService } from '../../services/scan-service.js';
import { SCAN_LIMITS } from '../../config/index.js';
import { ValidationError, ScanTooLargeError } from '../../types/errors.js';

type BuiltInRulePack = 'lsclaw-governance';

const RULE_PACK_PATTERNS: Record<BuiltInRulePack, string> = {
  'lsclaw-governance': 'projects/lsclaw-governance/**/*.yml',
};

function hasRuleCatalog(baseDir: string): boolean {
  const languageDir = path.join(baseDir, 'languages');
  const projectDir = path.join(baseDir, 'projects');

  return existsSync(languageDir) && existsSync(projectDir);
}

function isPreferredRuleRoot(baseDir: string): boolean {
  return path.basename(path.resolve(baseDir, '..')) !== 'packages';
}

let resolvedRulesRoot: string | null = null;

function resolveRulesRoot(): string {
  if (resolvedRulesRoot) {
    return resolvedRulesRoot;
  }

  const candidates = [
    path.resolve(process.cwd(), 'rules'),
    path.resolve(process.cwd(), '..', 'rules'),
    path.resolve(process.cwd(), '..', '..', 'rules'),
    path.resolve(process.cwd(), '..', '..', '..', 'rules'),
  ];

  const found = candidates.find(
    (candidate) => existsSync(candidate) && hasRuleCatalog(candidate) && isPreferredRuleRoot(candidate)
  ) ?? candidates.find(
    (candidate) => existsSync(candidate) && hasRuleCatalog(candidate)
  );
  resolvedRulesRoot = found ?? candidates[candidates.length - 1];
  return resolvedRulesRoot;
}

function resolveRulePackPatterns(rulePack?: BuiltInRulePack): string[] | undefined {
  if (!rulePack) {
    return undefined;
  }

  const relativePattern = RULE_PACK_PATTERNS[rulePack];
  if (!relativePattern) {
    return undefined;
  }

  return [path.join(resolveRulesRoot(), relativePattern)];
}

// 请求体验证 schema
interface ScanRequestBody {
  scope: {
    tenant_id?: string;
    project_id?: string;
    actor_id?: string;
    mode?: 'local' | 'service';
  };
  project: string;
  rootDir: string;
  include?: string[];
  ignore?: string[];
  rules?: string[];  // 规则文件 glob 模式数组
  rulePack?: BuiltInRulePack;
  includeStats?: boolean;
  deterministic?: boolean;
  openApiDocuments?: Array<{
    source?: string;
    file?: string;
    content: string;
    format?: 'yaml' | 'json';
  }>;
  schemaDocuments?: Array<{
    source?: string;
    file?: string;
    content: string;
    format?: 'sql' | 'prisma';
  }>;
  contractArtifacts?: Array<{
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
    governanceDomain?: string[] | string;
    impactHint?: 'low' | 'medium' | 'high';
    range?: {
      start: { line: number; column: number; index: number };
      end: { line: number; column: number; index: number };
    };
  }>;
  schemaArtifacts?: Array<{
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
    governanceDomain?: string[] | string;
    impactHint?: 'low' | 'medium' | 'high';
    range?: {
      start: { line: number; column: number; index: number };
      end: { line: number; column: number; index: number };
    };
  }>;
}

export default async function scanRoutes(fastify: FastifyInstance) {
  // POST /scan - 执行同步扫描
  fastify.post(
    '/',
    {
      schema: {
        description: '执行代码扫描',
        body: {
          type: 'object',
          required: ['project', 'rootDir'],
          properties: {
            scope: {
              type: 'object',
              properties: {
                tenant_id: { type: 'string' },
                project_id: { type: 'string' },
                actor_id: { type: 'string' },
                mode: { type: 'string', enum: ['local', 'service'] },
              },
            },
            project: { type: 'string', minLength: 1 },
            rootDir: { type: 'string', minLength: 1 },
            include: { type: 'array', items: { type: 'string' } },
            ignore: { type: 'array', items: { type: 'string' } },
            rules: { type: 'array', items: { type: 'string' } },
            rulePack: {
              type: 'string',
              enum: ['lsclaw-governance'],
              description: '内置治理规则包。当前支持 lsclaw-governance。',
            },
            includeStats: { type: 'boolean' },
            deterministic: { type: 'boolean' },
            openApiDocuments: {
              type: 'array',
              items: {
                type: 'object',
                required: ['content'],
                properties: {
                  source: { type: 'string' },
                  file: { type: 'string' },
                  content: { type: 'string', minLength: 1 },
                  format: { type: 'string', enum: ['yaml', 'json'] },
                },
              },
            },
            schemaDocuments: {
              type: 'array',
              items: {
                type: 'object',
                required: ['content'],
                properties: {
                  source: { type: 'string' },
                  file: { type: 'string' },
                  content: { type: 'string', minLength: 1 },
                  format: { type: 'string', enum: ['sql', 'prisma'] },
                },
              },
            },
            contractArtifacts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  source: { type: 'string' },
                  ruleId: { type: 'string' },
                  severity: { type: 'string', enum: ['info', 'warning', 'error'] },
                  message: { type: 'string' },
                  file: { type: 'string' },
                  language: { type: 'string' },
                  line: { type: 'number' },
                  column: { type: 'number' },
                  startIndex: { type: 'number' },
                  endIndex: { type: 'number' },
                  excerpt: { type: 'string' },
                  governanceDomain: {
                    anyOf: [
                      { type: 'string' },
                      {
                        type: 'array',
                        items: { type: 'string' },
                      },
                    ],
                  },
                  impactHint: { type: 'string', enum: ['low', 'medium', 'high'] },
                  range: {
                    type: 'object',
                    properties: {
                      start: {
                        type: 'object',
                        properties: {
                          line: { type: 'number' },
                          column: { type: 'number' },
                          index: { type: 'number' },
                        },
                      },
                      end: {
                        type: 'object',
                        properties: {
                          line: { type: 'number' },
                          column: { type: 'number' },
                          index: { type: 'number' },
                        },
                      },
                    },
                  },
                },
                additionalProperties: true,
              },
            },
            schemaArtifacts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  source: { type: 'string' },
                  ruleId: { type: 'string' },
                  severity: { type: 'string', enum: ['info', 'warning', 'error'] },
                  message: { type: 'string' },
                  file: { type: 'string' },
                  language: { type: 'string' },
                  line: { type: 'number' },
                  column: { type: 'number' },
                  startIndex: { type: 'number' },
                  endIndex: { type: 'number' },
                  excerpt: { type: 'string' },
                  governanceDomain: {
                    anyOf: [
                      { type: 'string' },
                      {
                        type: 'array',
                        items: { type: 'string' },
                      },
                    ],
                  },
                  impactHint: { type: 'string', enum: ['low', 'medium', 'high'] },
                  range: {
                    type: 'object',
                    properties: {
                      start: {
                        type: 'object',
                        properties: {
                          line: { type: 'number' },
                          column: { type: 'number' },
                          index: { type: 'number' },
                        },
                      },
                      end: {
                        type: 'object',
                        properties: {
                          line: { type: 'number' },
                          column: { type: 'number' },
                          index: { type: 'number' },
                        },
                      },
                    },
                  },
                },
                additionalProperties: true,
              },
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                properties: {
                  filesScanned: { type: 'number' },
                  findings: { type: 'array' },
                  parseCache: { type: 'object' },
                },
              },
            },
          },
        },
      },
    },
    fastify.withCancellation(async (request: FastifyRequest, reply: FastifyReply, signal: AbortSignal) => {
      const {
        project,
        rootDir,
        include,
        ignore,
        rules,
        includeStats,
        deterministic,
        rulePack,
        openApiDocuments,
        schemaDocuments,
      } = request.body as ScanRequestBody;
      const { contractArtifacts, schemaArtifacts } = request.body as ScanRequestBody;
      const resolvedRules = rules && rules.length > 0
        ? rules
        : resolveRulePackPatterns(rulePack);

      // 验证必填字段
      if (!project || typeof project !== 'string') {
        throw new ValidationError('INVALID_PROJECT', 'project must be a non-empty string');
      }

      if (!rootDir || typeof rootDir !== 'string') {
        throw new ValidationError('INVALID_ROOTDIR', 'rootDir must be a non-empty string');
      }

      // 执行扫描
      const result = await scanService.execute({
        project,
        rootDir,
        include,
        ignore,
        rules: resolvedRules,
        includeStats: includeStats ?? false,
        deterministic,
        openApiDocuments,
        schemaDocuments,
        contractArtifacts,
        schemaArtifacts,
        signal,
      });

      // 检查响应大小限制（硬约束 #4）
      const responseBytes = JSON.stringify(result).length;
      if (responseBytes > SCAN_LIMITS.maxResponseBytes) {
        throw new ScanTooLargeError(
          SCAN_LIMITS.maxResponseBytes,
          responseBytes
        );
      }

      // 返回成功响应
      return reply.send({ data: result });
    })
  );
}
