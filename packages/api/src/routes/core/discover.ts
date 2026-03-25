import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { symbolService } from '../../services/symbol-service.js';
import {
  discoverSymbolsRouteSchema,
  normalizeDiscoverSymbolsRequest,
  type DiscoverSymbolsRequestBody,
} from './discover/shared.js';

export default async function discoverRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/symbols',
    {
      schema: discoverSymbolsRouteSchema,
    },
    fastify.withCancellation(async (request: FastifyRequest, reply: FastifyReply, signal: AbortSignal) => {
      const { rootDir, include, ignore, limit } = normalizeDiscoverSymbolsRequest(
        request.body as DiscoverSymbolsRequestBody
      );
      const result = await symbolService.discoverSymbols({
        rootDir,
        include,
        ignore,
        limit,
        signal,
      });

      return reply.send({ data: result });
    })
  );
}
