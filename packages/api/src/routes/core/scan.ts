import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { scanService } from '../../services/scan-service.js';
import { SCAN_LIMITS } from '../../config/index.js';
import { ValidationError, ScanTooLargeError } from '../../types/errors.js';

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
  includeStats?: boolean;
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
          required: ['scope', 'project', 'rootDir'],
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
            includeStats: { type: 'boolean' },
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
    async (request: FastifyRequest<{ Body: ScanRequestBody }>, reply: FastifyReply) => {
      const { project, rootDir, include, ignore, includeStats } = request.body;

      // 验证必填字段
      if (!project || typeof project !== 'string') {
        throw new ValidationError('INVALID_PROJECT', 'project must be a non-empty string');
      }

      if (!rootDir || typeof rootDir !== 'string') {
        throw new ValidationError('INVALID_ROOTDIR', 'rootDir must be a non-empty string');
      }

      // 获取取消信号
      const abortController = (request as any).abortController;
      const signal = abortController?.signal || new AbortController().signal;

      // 执行扫描
      const result = await scanService.execute({
        project,
        rootDir,
        include,
        ignore,
        includeStats: includeStats ?? false,
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
    }
  );
}
