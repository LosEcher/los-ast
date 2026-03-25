import { describe, expect, it } from 'vitest';

import { ValidationError } from '../../../src/types/errors.js';
import {
  discoverSymbolsRouteSchema,
  normalizeDiscoverSymbolsRequest,
} from '../../../src/routes/core/discover/shared.js';

describe('discover route shared helpers', () => {
  it('keeps the stable discover schema shape for body and success response', () => {
    expect(discoverSymbolsRouteSchema.body.required).toEqual(['rootDir']);
    expect(discoverSymbolsRouteSchema.body.properties.limit).toMatchObject({
      type: 'number',
      minimum: 1,
      maximum: 1000,
    });
    expect(discoverSymbolsRouteSchema.response[200].properties.data.properties).toHaveProperty('symbols');
    expect(discoverSymbolsRouteSchema.response[200].properties.data.properties).toHaveProperty('total');
    expect(discoverSymbolsRouteSchema.response[200].properties.data.properties).toHaveProperty('truncated');
  });

  it('normalizes discover requests and applies the default limit conservatively', () => {
    expect(normalizeDiscoverSymbolsRequest({
      scope: {
        tenant_id: 'tenant-a',
        project_id: 'project-a',
      },
      rootDir: '/tmp/project',
      include: ['src/**/*.ts'],
      ignore: ['dist/**'],
    })).toEqual({
      rootDir: '/tmp/project',
      include: ['src/**/*.ts'],
      ignore: ['dist/**'],
      limit: 100,
    });

    expect(normalizeDiscoverSymbolsRequest({
      scope: {
        tenant_id: 'tenant-a',
        project_id: 'project-a',
      },
      rootDir: '/tmp/project',
      limit: 500,
    })).toMatchObject({
      rootDir: '/tmp/project',
      limit: 500,
    });
  });

  it('rejects invalid rootDir or limit at the shared validation boundary', () => {
    expect(() => normalizeDiscoverSymbolsRequest({
      scope: {
        tenant_id: 'tenant-a',
        project_id: 'project-a',
      },
      rootDir: '' as unknown as string,
    })).toThrowError(new ValidationError('INVALID_ROOTDIR', 'rootDir must be a non-empty string'));

    expect(() => normalizeDiscoverSymbolsRequest({
      scope: {
        tenant_id: 'tenant-a',
        project_id: 'project-a',
      },
      rootDir: '/tmp/project',
      limit: 0,
    })).toThrowError(new ValidationError('INVALID_LIMIT', 'limit must be a number between 1 and 1000'));
  });
});
