import { ValidationError } from '../../../types/errors.js';

export interface DiscoverSymbolsRequestBody {
  scope: {
    tenant_id?: string;
    project_id?: string;
    actor_id?: string;
    mode?: 'local' | 'service';
  };
  rootDir: string;
  include?: string[];
  ignore?: string[];
  limit?: number;
}

export const discoverSymbolsRouteSchema = {
  description: '发现代码库中的符号定义',
  body: {
    type: 'object',
    required: ['rootDir'],
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
      rootDir: { type: 'string', minLength: 1 },
      include: { type: 'array', items: { type: 'string' } },
      ignore: { type: 'array', items: { type: 'string' } },
      limit: { type: 'number', minimum: 1, maximum: 1000 },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: {
            symbols: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  kind: { type: 'string', enum: ['function', 'class', 'interface', 'variable', 'type'] },
                  file: { type: 'string' },
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
              },
            },
            total: { type: 'number' },
            truncated: { type: 'boolean' },
          },
        },
      },
    },
  },
} as const;

export function normalizeDiscoverSymbolsRequest(
  body: DiscoverSymbolsRequestBody
) {
  const { rootDir, include, ignore, limit } = body;

  if (!rootDir || typeof rootDir !== 'string') {
    throw new ValidationError('INVALID_ROOTDIR', 'rootDir must be a non-empty string');
  }

  if (limit !== undefined && (typeof limit !== 'number' || limit < 1 || limit > 1000)) {
    throw new ValidationError('INVALID_LIMIT', 'limit must be a number between 1 and 1000');
  }

  return {
    rootDir,
    include,
    ignore,
    limit: limit ?? 100,
  };
}
