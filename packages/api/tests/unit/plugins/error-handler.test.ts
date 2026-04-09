/**
 * Error Handler Plugin Unit Tests
 * P0: Critical plugin test coverage
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fastify from 'fastify';
import errorHandlerPlugin from '../../../src/plugins/error-handler';
import { AppError, ValidationError, NotFoundError } from '../../../src/types/errors';

describe('Error Handler Plugin', () => {
  let app: ReturnType<typeof fastify>;

  beforeEach(async () => {
    app = fastify({ logger: false });
    await app.register(errorHandlerPlugin);
  });

  describe('AppError handling', () => {
    it('should handle ValidationError with 400 status', async () => {
      app.get('/test', async () => {
        throw new ValidationError('INVALID_INPUT', 'Invalid input provided');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.category).toBe('VALIDATION');
      expect(body.error.code).toBe('INVALID_INPUT');
      expect(body.error.message).toBe('Invalid input provided');
    });

    it('should handle NotFoundError with 404 status', async () => {
      app.get('/test', async () => {
        throw new NotFoundError('RESOURCE_NOT_FOUND', 'Resource not found');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.category).toBe('NOT_FOUND');
    });

    it('should include requestId in error response', async () => {
      app.addHook('onRequest', async (request) => {
        request.requestId = 'test-request-id-123';
      });

      app.get('/test', async () => {
        throw new ValidationError('ERROR', 'Test error');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      const body = JSON.parse(response.body);
      expect(body.error.requestId).toBe('test-request-id-123');
    });

    it('should include timestamp in error response', async () => {
      const beforeTime = Date.now();
      
      app.get('/test', async () => {
        throw new ValidationError('ERROR', 'Test error');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      const afterTime = Date.now();
      const body = JSON.parse(response.body);
      
      const timestampMs = new Date(body.error.timestamp).getTime();
      expect(timestampMs).toBeGreaterThanOrEqual(beforeTime);
      expect(timestampMs).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('Fastify validation error handling', () => {
    it('should handle validation errors with proper category', async () => {
      app.post('/test', {
        schema: {
          body: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string' },
            },
          },
        },
      }, async () => ({ success: true }));

      const response = await app.inject({
        method: 'POST',
        url: '/test',
        payload: {}, // Missing required 'name'
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.category).toBe('VALIDATION');
    });
  });

  describe('generic Error handling', () => {
    it('should handle generic Error in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      
      app.get('/test', async () => {
        throw new Error('Sensitive internal details');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error.message).toBe('Internal server error');
      expect(body.error.details).toBeUndefined(); // No stack in production
      
      vi.unstubAllEnvs();
    });

    it('should include stack trace in development', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      
      app.get('/test', async () => {
        throw new Error('Test error');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      const body = JSON.parse(response.body);
      expect(body.error.details).toHaveProperty('stack');
      expect(body.error.details.stack).toContain('Test error');
      
      vi.unstubAllEnvs();
    });
  });

  describe('unknown error handling', () => {
    it('should handle non-Error throws', async () => {
      app.get('/test', async () => {
        throw 'String error';
      });

      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error.category).toBe('INTERNAL');
      expect(body.error.code).toBe('UNKNOWN_ERROR');
    });

    it('should handle null/undefined throws', async () => {
      app.get('/test-null', async () => {
        throw null;
      });

      app.get('/test-undefined', async () => {
        throw undefined;
      });

      const nullResponse = await app.inject({ method: 'GET', url: '/test-null' });
      const undefinedResponse = await app.inject({ method: 'GET', url: '/test-undefined' });

      expect(nullResponse.statusCode).toBe(500);
      expect(undefinedResponse.statusCode).toBe(500);
    });
  });

  describe('404 not found handler', () => {
    it('should handle non-existent routes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/non-existent-route',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.category).toBe('NOT_FOUND');
      expect(body.error.code).toBe('ROUTE_NOT_FOUND');
      expect(body.error.message).toContain('GET /non-existent-route');
    });

    it('should include requestId in 404 response', async () => {
      app.addHook('onRequest', async (request) => {
        request.requestId = '404-test-id';
      });

      const response = await app.inject({
        method: 'POST',
        url: '/missing',
      });

      const body = JSON.parse(response.body);
      expect(body.error.requestId).toBe('404-test-id');
    });
  });

  describe('error status code mapping', () => {
    it('should map all error categories to correct status codes', async () => {
      const testCases = [
        { category: 'VALIDATION', code: 400 },
        { category: 'AUTHENTICATION', code: 401 },
        { category: 'SCOPE', code: 403 },
        { category: 'NOT_FOUND', code: 404 },
        { category: 'TIMEOUT', code: 408 },
        { category: 'SCAN_TOO_LARGE', code: 413 },
        { category: 'SERVICE_UNAVAILABLE', code: 503 },
        { category: 'INTERNAL', code: 500 },
      ] as const;

      for (const { category, code } of testCases) {
        const testApp = fastify({ logger: false });
        await testApp.register(errorHandlerPlugin);

        testApp.get('/test', async () => {
          const error = new AppError(category, 'TEST_CODE', 'Test message', false);
          throw error;
        });

        const response = await testApp.inject({ method: 'GET', url: '/test' });
        expect(response.statusCode).toBe(code);
      }
    });
  });

  describe('retryable flag handling', () => {
    it('should preserve retryable flag in error response', async () => {
      app.get('/test', async () => {
        throw new AppError('SERVICE_UNAVAILABLE', 'TEMP_ERROR', 'Temp error', true);
      });

      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      const body = JSON.parse(response.body);
      expect(body.error.retryable).toBe(true);
    });

    it('should set retryable to false by default', async () => {
      app.get('/test', async () => {
        throw new ValidationError('ERROR', 'Test');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      const body = JSON.parse(response.body);
      expect(body.error.retryable).toBe(false);
    });
  });
});
