/**
 * HTTP Helpers Unit Tests
 * P0: Core utility test coverage
 */

import { describe, it, expect, vi } from 'vitest';
import type { FastifyReply } from 'fastify';
import {
  notFound,
  created,
  badRequest,
  ok,
  noContent,
} from '../../../src/utils/http-helpers';

describe('HTTP Helpers', () => {
  // Mock FastifyReply
  const createMockReply = (): FastifyReply => {
    const statusMock = vi.fn().mockReturnThis();
    return {
      status: statusMock,
    } as unknown as FastifyReply;
  };

  describe('notFound', () => {
    it('should set status to 404 and return error message', () => {
      const reply = createMockReply();
      const result = notFound(reply, 'User');

      expect(reply.status).toHaveBeenCalledWith(404);
      expect(result).toEqual({ error: { message: 'User not found' } });
    });

    it('should handle different resource types', () => {
      const reply = createMockReply();
      
      expect(notFound(reply, 'Incident')).toEqual({
        error: { message: 'Incident not found' },
      });
      expect(notFound(reply, 'Recovery Action')).toEqual({
        error: { message: 'Recovery Action not found' },
      });
    });
  });

  describe('created', () => {
    it('should set status to 201 and wrap data', () => {
      const reply = createMockReply();
      const data = { id: '123', name: 'Test' };
      
      const result = created(reply, data);

      expect(reply.status).toHaveBeenCalledWith(201);
      expect(result).toEqual({ data });
    });

    it('should handle different data types', () => {
      const reply = createMockReply();
      
      // Object
      expect(created(reply, { id: 1 })).toEqual({ data: { id: 1 } });
      
      // Array
      expect(created(reply, [1, 2, 3])).toEqual({ data: [1, 2, 3] });
      
      // String
      expect(created(reply, 'success')).toEqual({ data: 'success' });
      
      // Number
      expect(created(reply, 42)).toEqual({ data: 42 });
    });
  });

  describe('badRequest', () => {
    it('should set status to 400 and return error message', () => {
      const reply = createMockReply();
      const message = 'Invalid input format';
      
      const result = badRequest(reply, message);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(result).toEqual({ error: { message } });
    });

    it('should handle various error messages', () => {
      const reply = createMockReply();
      
      expect(badRequest(reply, 'Missing required field')).toEqual({
        error: { message: 'Missing required field' },
      });
      expect(badRequest(reply, 'Invalid JSON')).toEqual({
        error: { message: 'Invalid JSON' },
      });
    });
  });

  describe('ok', () => {
    it('should wrap data in success response', () => {
      const data = { id: '123', status: 'active' };
      
      const result = ok(data);

      expect(result).toEqual({ data });
    });

    it('should handle null and undefined', () => {
      expect(ok(null)).toEqual({ data: null });
      expect(ok(undefined)).toEqual({ data: undefined });
    });

    it('should handle nested objects', () => {
      const nestedData = {
        user: {
          id: '123',
          profile: {
            name: 'Test',
          },
        },
      };
      
      expect(ok(nestedData)).toEqual({ data: nestedData });
    });
  });

  describe('noContent', () => {
    it('should set status to 204 and return empty string', () => {
      const reply = createMockReply();
      
      const result = noContent(reply);

      expect(reply.status).toHaveBeenCalledWith(204);
      expect(result).toBe('');
    });
  });

  describe('response shape consistency', () => {
    it('should maintain consistent error response shape', () => {
      const reply = createMockReply();
      
      const notFoundResult = notFound(reply, 'Resource');
      const badRequestResult = badRequest(reply, 'Error');

      // Both should have error.message structure
      expect(notFoundResult.error).toHaveProperty('message');
      expect(badRequestResult.error).toHaveProperty('message');
    });

    it('should maintain consistent success response shape', () => {
      const reply = createMockReply();
      
      const createdResult = created(reply, { id: 1 });
      const okResult = ok({ id: 1 });

      // Both should have data property
      expect(createdResult).toHaveProperty('data');
      expect(okResult).toHaveProperty('data');
    });
  });
});
