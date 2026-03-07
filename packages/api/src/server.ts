import Fastify from 'fastify';
import { logStartupConfig, PORT } from './config/index.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import requestIdPlugin from './plugins/request-id.js';
import scopeValidatorPlugin from './plugins/scope-validator.js';
import healthCheckPlugin from './plugins/health-check.js';
import cancellationPlugin from './plugins/cancellation.js';
import scanRoutes from './routes/scan.js';
import discoverRoutes from './routes/discover.js';
import incidentRoutes from './routes/incident.js';

const server = Fastify({
  logger: true,
});

// 注册插件（顺序很重要）
// 1. 先注册 request-id，确保所有请求都有 ID
await server.register(requestIdPlugin);
// 2. 注册 error-handler，确保错误处理使用 requestId
await server.register(errorHandlerPlugin);
// 3. 注册 health-check（在 scope-validator 之前，避免 scope 验证）
await server.register(healthCheckPlugin);
// 4. 注册 cancellation，为所有请求添加取消支持（硬约束 #5）
await server.register(cancellationPlugin);
// 5. 注册 scope-validator，验证 scope（在路由之前）
await server.register(scopeValidatorPlugin);

// 6. 注册路由
await server.register(scanRoutes, { prefix: '/scan' });
await server.register(discoverRoutes, { prefix: '/discover' });
await server.register(incidentRoutes, { prefix: '/incidents' });

async function main() {
  logStartupConfig();

  try {
    await server.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`[STARTUP] API server listening on port ${PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
