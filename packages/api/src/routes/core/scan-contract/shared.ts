import type {
  ScanParams,
} from '@los-ast/shared/types';

export type BuiltInRulePack = string;

export interface ScanRequestBody extends Omit<ScanParams, 'rulePack'> {
  rulePack?: BuiltInRulePack;
}

export const SCAN_REQUEST_BASE_PROPERTY_KEYS = [
  'scope',
  'project',
  'rootDir',
  'include',
  'ignore',
  'rules',
  'rulePack',
  'includeStats',
  'deterministic',
] as const;

export const SCAN_NATIVE_INPUT_KEYS = [
  'openApiDocuments',
  'openApiComparisons',
  'schemaDocuments',
  'schemaComparisons',
  'contractArtifacts',
  'schemaArtifacts',
] as const;

export type ScanNativeInputKey = (typeof SCAN_NATIVE_INPUT_KEYS)[number];

export const SCAN_REQUEST_PROPERTY_KEYS = [
  ...SCAN_REQUEST_BASE_PROPERTY_KEYS,
  ...SCAN_NATIVE_INPUT_KEYS,
] as const;

export const scanScopeSchema = {
  type: 'object',
  properties: {
    tenant_id: { type: 'string' },
    project_id: { type: 'string' },
    actor_id: { type: 'string' },
    mode: { type: 'string', enum: ['local', 'service'] },
  },
} as const;

const positionSchema = {
  type: 'object',
  properties: {
    line: { type: 'number' },
    column: { type: 'number' },
    index: { type: 'number' },
  },
} as const;

const rangeSchema = {
  type: 'object',
  properties: {
    start: positionSchema,
    end: positionSchema,
  },
} as const;

const governanceDomainInputSchema = {
  anyOf: [
    { type: 'string' },
    {
      type: 'array',
      items: { type: 'string' },
    },
  ],
} as const;

const artifactFindingInputSchema = {
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
    governanceDomain: governanceDomainInputSchema,
    impactHint: { type: 'string', enum: ['low', 'medium', 'high'] },
    range: rangeSchema,
  },
  additionalProperties: true,
} as const;

export const scanNativeInputProperties = {
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
  openApiComparisons: {
    type: 'array',
    items: {
      type: 'object',
      required: ['baseline', 'current'],
      properties: {
        source: { type: 'string' },
        file: { type: 'string' },
        baseline: { type: 'string', minLength: 1 },
        current: { type: 'string', minLength: 1 },
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
  schemaComparisons: {
    type: 'array',
    items: {
      type: 'object',
      required: ['baseline', 'current'],
      properties: {
        source: { type: 'string' },
        file: { type: 'string' },
        baseline: { type: 'string', minLength: 1 },
        current: { type: 'string', minLength: 1 },
        format: { type: 'string', enum: ['sql', 'prisma'] },
      },
    },
  },
  contractArtifacts: {
    type: 'array',
    items: artifactFindingInputSchema,
  },
  schemaArtifacts: {
    type: 'array',
    items: artifactFindingInputSchema,
  },
} as const;

const findingSchema = {
  type: 'object',
  properties: {
    tool: { type: 'string' },
    version: { type: 'number' },
    timestamp: { type: 'string' },
    project: { type: 'string' },
    ruleFile: {
      anyOf: [
        { type: 'string' },
        { type: 'null' },
      ],
    },
    ruleId: { type: 'string' },
    findingSource: { type: 'string', enum: ['ast', 'contract', 'schema'] },
    governanceDomain: {
      anyOf: [
        {
          type: 'array',
          items: { type: 'string' },
        },
        { type: 'null' },
      ],
    },
    impactHint: {
      anyOf: [
        { type: 'string', enum: ['low', 'medium', 'high'] },
        { type: 'null' },
      ],
    },
    severity: { type: 'string', enum: ['info', 'warning', 'error'] },
    message: { type: 'string' },
    file: { type: 'string' },
    language: { type: 'string' },
    range: rangeSchema,
    excerpt: { type: 'string' },
    hasFix: { type: 'boolean' },
    proposedReplacement: {
      anyOf: [
        { type: 'string' },
        { type: 'null' },
      ],
    },
    diff: {
      anyOf: [
        { type: 'string' },
        { type: 'null' },
      ],
    },
    applied: { type: 'boolean' },
    fingerprint: { type: 'string' },
  },
  additionalProperties: true,
} as const;

export const scanResponseDataSchema = {
  type: 'object',
  properties: {
    filesScanned: { type: 'number' },
    findings: {
      type: 'array',
      items: findingSchema,
    },
    parseCache: {
      type: 'object',
      properties: {
        hits: { type: 'number' },
        misses: { type: 'number' },
        entries: { type: 'number' },
        maxEntries: { type: 'number' },
      },
    },
    parseFailures: {
      type: 'object',
      properties: {
        count: { type: 'number' },
        sampleLimit: { type: 'number' },
        truncated: { type: 'boolean' },
        byLanguage: {
          type: 'object',
          additionalProperties: { type: 'number' },
        },
        samples: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              file: { type: 'string' },
              language: { type: 'string' },
              error: { type: 'string' },
            },
          },
        },
      },
    },
    scanTelemetry: {
      type: 'object',
      properties: {
        durationMs: { type: 'number' },
        mode: { type: 'string', enum: ['ast', 'native_only', 'hybrid'] },
        explicitRulePatterns: { type: 'number' },
        loadedRules: { type: 'number' },
        estimatedFiles: { type: 'number' },
        nativeInputs: {
          type: 'object',
          properties: {
            openApiDocuments: { type: 'number' },
            openApiComparisons: { type: 'number' },
            schemaDocuments: { type: 'number' },
            schemaComparisons: { type: 'number' },
            contractArtifacts: { type: 'number' },
            schemaArtifacts: { type: 'number' },
          },
        },
      },
    },
  },
} as const;

export const scanResponseSchema = {
  type: 'object',
  properties: {
    data: scanResponseDataSchema,
  },
} as const;
