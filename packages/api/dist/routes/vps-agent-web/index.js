import { incidentRoutes, attributionRoutes, recoveryRoutes, approvalRoutes, } from '../experimental/index.js';
export default async function vpsAgentWebRoutes(fastify) {
    await fastify.register(incidentRoutes, { prefix: '/incidents' });
    await fastify.register(attributionRoutes, { prefix: '/attribution' });
    await fastify.register(recoveryRoutes, { prefix: '/recovery' });
    await fastify.register(approvalRoutes, { prefix: '/approvals' });
}
//# sourceMappingURL=index.js.map