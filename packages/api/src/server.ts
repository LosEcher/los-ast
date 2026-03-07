import Fastify from 'fastify';
import { logStartupConfig, PORT } from './config/index.js';

const server = Fastify({
  logger: true,
});

server.get('/healthz/live', async () => {
  return { status: 'alive' };
});

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
