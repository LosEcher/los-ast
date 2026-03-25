import { symbolService } from '../../services/symbol-service.js';
import { discoverSymbolsRouteSchema, normalizeDiscoverSymbolsRequest, } from './discover/shared.js';
export default async function discoverRoutes(fastify) {
    fastify.post('/symbols', {
        schema: discoverSymbolsRouteSchema,
    }, fastify.withCancellation(async (request, reply, signal) => {
        const { rootDir, include, ignore, limit } = normalizeDiscoverSymbolsRequest(request.body);
        const result = await symbolService.discoverSymbols({
            rootDir,
            include,
            ignore,
            limit,
            signal,
        });
        return reply.send({ data: result });
    }));
}
