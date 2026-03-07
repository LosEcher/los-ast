import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { symbolService } from '../../services/symbol-service.js';
import { ValidationError } from '../../types/errors.js';

// 请求体验证 schema
interface DiscoverSymbolsRequestBody {
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

export default async function discoverRoutes(fastify: FastifyInstance) {
  // POST /discover/symbols - 发现代码库中的符号定义
  fastify.post(
    '/symbols',
    {
      schema: {
        description: '发现代码库中的符号定义',
        body: {
          type: 'object',
          required: ['scope', 'rootDir'],
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
      },
    },
    async (request: FastifyRequest<{ Body: DiscoverSymbolsRequestBody }>, reply: FastifyReply) => {
      const { rootDir, include, ignore, limit } = request.body;

      // 验证必填字段
      if (!rootDir || typeof rootDir !== 'string') {
        throw new ValidationError('INVALID_ROOTDIR', 'rootDir must be a non-empty string');
      }

      // 验证 limit 范围
      if (limit !== undefined && (typeof limit !== 'number' || limit < 1 || limit > 1000)) {
        throw new ValidationError('INVALID_LIMIT', 'limit must be a number between 1 and 1000');
      }

      // 获取取消信号
      const abortController = (request as any).abortController;
      const signal = abortController?.signal || new AbortController().signal;

      // 执行符号发现
      const result = await symbolService.discoverSymbols({
        rootDir,
        include,
        ignore,
        limit: limit ?? 100,
        signal,
      });

      // 返回成功响应
      return reply.send({ data: result });
    }
  );
}
