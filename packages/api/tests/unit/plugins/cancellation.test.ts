import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fastify from 'fastify';
import http from 'node:http';
import { promisify } from 'node:util';

import errorHandlerPlugin from '../../../src/plugins/error-handler';
import requestIdPlugin from '../../../src/plugins/request-id';
import cancellationPlugin from '../../../src/plugins/cancellation';

const wait = promisify(setTimeout);

async function waitForCondition(check: () => boolean, timeoutMs = 250, intervalMs = 10): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) {
      return true;
    }
    await wait(intervalMs);
  }

  return check();
}

vi.mock('../../../src/config/index.js', async () => {
  const actual = await vi.importActual('../../../src/config/index.js');
  return {
    ...actual,
    SCAN_LIMITS: {
      ...actual.SCAN_LIMITS,
      maxDurationMs: 20,
    },
  };
});

describe('Cancellation Plugin', () => {
  let app: ReturnType<typeof fastify>;

  beforeEach(async () => {
    app = fastify({ logger: false });
    await app.register(requestIdPlugin);
    await app.register(errorHandlerPlugin);
    await app.register(cancellationPlugin);
  });

  afterEach(async () => {
    await app.close();
  });

  it('should convert timeout cancellation into 408 Timeout', async () => {
    app.get(
      '/timeout',
      {},
      app.withCancellation(async (_request, reply, signal) => {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(resolve, 200);
          signal.addEventListener('abort', () => {
            clearTimeout(timeout);
            reject(new Error('Scan aborted'));
          }, { once: true });
        });

        return reply.send({ ok: true });
      })
    );

    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/timeout' });
    expect(response.statusCode).toBe(408);

    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('REQUEST_TIMEOUT');
    expect(body.error.category).toBe('TIMEOUT');
    expect(body.error.message).toMatch(/Operation exceeded/);
  });

  it('should fail gracefully when client disconnects', async () => {
    let abortedBySignal = false;

    app.get(
      '/disconnect',
      {},
      app.withCancellation(async (_request, reply, signal) => {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(resolve, 200);
          signal.addEventListener('abort', () => {
            clearTimeout(timeout);
            abortedBySignal = true;
            reject(new Error('Scan aborted'));
          }, { once: true });
        });

        return reply.send({ ok: true });
      })
    );

    await app.ready();

    const address = await app.listen({ port: 0 });
    const port = Number((new URL(address)).port);

    const responseError = await new Promise<Error>((resolve) => {
      const req = http.request({
        method: 'GET',
        host: '127.0.0.1',
        port,
        path: '/disconnect',
      });

      req.on('error', (error) => {
        resolve(error as Error);
      });

      req.on('response', (response) => {
        response.resume();
        response.on('end', () => {
          resolve(new Error('Expected client disconnect, got response'));
        });
      });

      setTimeout(() => {
        req.destroy();
      }, 5);

      req.end();
    });

    expect(responseError).toBeDefined();
    expect(responseError.message).toMatch(/socket hang up|aborted/i);

    expect(await waitForCondition(() => abortedBySignal)).toBe(true);
  });
});
