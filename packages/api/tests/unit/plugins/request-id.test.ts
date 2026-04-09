/**
 * Request ID Plugin Unit Tests
 * Phase 1: Core plugin test coverage
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fastify from 'fastify';
import requestIdPlugin from '../../../src/plugins/request-id';

describe('Request ID Plugin', () => {
  let app: ReturnType<typeof fastify>;

  beforeEach(async () => {
    app = fastify({ logger: false });
    await app.register(requestIdPlugin);
    
    app.get('/test', async (request) => {
      return { requestId: request.requestId };
    });
  });

  describe('request ID generation', () => {
    it('should generate request ID if not provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.requestId).toBeDefined();
      expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    });

    it('should use provided request ID from header', async () => {
      const customRequestId = 'custom-request-id-123';
      
      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          'x-request-id': customRequestId,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.requestId).toBe(customRequestId);
    });

    it('should return request ID in response header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.headers['x-request-id']).toBeDefined();
      const body = JSON.parse(response.body);
      expect(response.headers['x-request-id']).toBe(body.requestId);
    });

    it('should return provided request ID in response header', async () => {
      const customRequestId = 'my-request-id';
      
      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          'x-request-id': customRequestId,
        },
      });

      expect(response.headers['x-request-id']).toBe(customRequestId);
    });
  });

  describe('request ID uniqueness', () => {
    it('should generate unique request IDs for multiple requests', async () => {
      const requestIds = new Set<string>();
      
      for (let i = 0; i < 10; i++) {
        const response = await app.inject({
          method: 'GET',
          url: '/test',
        });
        const body = JSON.parse(response.body);
        requestIds.add(body.requestId);
      }

      expect(requestIds.size).toBe(10);
    });
  });

  describe('request ID propagation', () => {
    it('should have requestId available in request context', async () => {
      let capturedRequestId: string | undefined;

      app.get('/capture', async (request) => {
        capturedRequestId = request.requestId;
        return { ok: true };
      });

      const response = await app.inject({
        method: 'GET',
        url: '/capture',
        headers: {
          'x-request-id': 'test-id-123',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(capturedRequestId).toBe('test-id-123');
    });
  });

  describe('trace ID propagation', () => {
    it('should capture traceId from header and return it', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          'x-trace-id': 'trace-abc-123',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-trace-id']).toBe('trace-abc-123');
    });

    it('should make traceId available in request context', async () => {
      let capturedTraceId: string | undefined;

      app.get('/capture-trace', async (request) => {
        capturedTraceId = request.traceId;
        return { traceId: request.traceId };
      });

      const response = await app.inject({
        method: 'GET',
        url: '/capture-trace',
        headers: {
          'x-trace-id': 'distributed-trace-456',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(capturedTraceId).toBe('distributed-trace-456');
      const body = JSON.parse(response.body);
      expect(body.traceId).toBe('distributed-trace-456');
    });

    it('should not set traceId header when not provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-trace-id']).toBeUndefined();
    });
  });
});
