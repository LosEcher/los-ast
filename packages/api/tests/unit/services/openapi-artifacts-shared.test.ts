import { describe, expect, it } from 'vitest';
import {
  getComparableObjectShape,
  parseDocument,
  resolveOperationLine,
} from '../../../src/services/openapi-artifacts/shared.js';

describe('openapi artifacts shared helpers', () => {
  it('anchors operations to the concrete YAML operation line', () => {
    const document = {
      source: 'openapi-inline',
      file: '/tmp/openapi.yaml',
      format: 'yaml' as const,
      content: [
        'openapi: 3.0.3',
        'paths:',
        '  /users:',
        '    post:',
        '      operationId: createUser',
        "      responses: {'200': { description: ok }}",
      ].join('\n'),
    };

    expect(resolveOperationLine(document, 'POST /users')).toBe(4);
  });

  it('merges local refs, allOf branches, and common oneOf fields into a comparable object shape', () => {
    const parsed = parseDocument({
      source: 'openapi-inline',
      file: '/tmp/openapi.yaml',
      format: 'yaml',
      content: [
        'openapi: 3.0.3',
        'components:',
        '  schemas:',
        '    UserBase:',
        '      type: object',
        '      required: [id]',
        '      properties:',
        '        id: { type: string }',
        '    UserEnvelope:',
        '      allOf:',
        "        - $ref: '#/components/schemas/UserBase'",
        '        - oneOf:',
        '            - type: object',
        '              required: [role]',
        '              properties:',
        '                role: { type: string }',
        '                team: { type: string }',
        '            - type: object',
        '              required: [role]',
        '              properties:',
        '                role: { type: string }',
        '                region: { type: string }',
        'paths: {}',
      ].join('\n'),
    }, 0);

    const shape = getComparableObjectShape(parsed, {
      $ref: '#/components/schemas/UserEnvelope',
    });

    expect(Array.from(shape.properties.keys()).sort()).toEqual(['id', 'role']);
    expect(Array.from(shape.required).sort()).toEqual(['id', 'role']);
    expect(shape.pathSuffix).toBe('');
  });

  it('preserves array root schemas via path suffix', () => {
    const parsed = parseDocument({
      source: 'openapi-inline',
      file: '/tmp/openapi.yaml',
      format: 'yaml',
      content: 'openapi: 3.0.3\npaths: {}\n',
    }, 0);

    const shape = getComparableObjectShape(parsed, {
      type: 'array',
      items: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
    });

    expect(shape.pathSuffix).toBe('[]');
    expect(Array.from(shape.properties.keys())).toEqual(['id']);
    expect(Array.from(shape.required)).toEqual(['id']);
  });

  it('captures comparable validation keywords on leaf fields', () => {
    const parsed = parseDocument({
      source: 'openapi-inline',
      file: '/tmp/openapi.yaml',
      format: 'yaml',
      content: 'openapi: 3.0.3\npaths: {}\n',
    }, 0);

    const shape = getComparableObjectShape(parsed, {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          format: 'email',
          minLength: 5,
          maxLength: 128,
          pattern: '^[^@]+@[^@]+$',
        },
        tags: {
          type: 'array',
          minItems: 1,
          maxItems: 8,
          uniqueItems: true,
          items: {
            type: 'string',
          },
        },
      },
    });

    expect(shape.properties.get('email')?.validation).toEqual({
      exclusiveMaximum: false,
      exclusiveMinimum: false,
      format: 'email',
      maxItems: undefined,
      maxLength: 128,
      maxProperties: undefined,
      maximum: undefined,
      minItems: undefined,
      minLength: 5,
      minProperties: undefined,
      minimum: undefined,
      multipleOf: undefined,
      pattern: '^[^@]+@[^@]+$',
      uniqueItems: false,
    });
    expect(shape.properties.get('tags')?.validation).toEqual({
      exclusiveMaximum: false,
      exclusiveMinimum: false,
      format: undefined,
      maxItems: 8,
      maxLength: undefined,
      maxProperties: undefined,
      maximum: undefined,
      minItems: 1,
      minLength: undefined,
      minProperties: undefined,
      minimum: undefined,
      multipleOf: undefined,
      pattern: undefined,
      uniqueItems: true,
    });
  });

  it('resolves local json-pointer refs beyond the schema root object', () => {
    const parsed = parseDocument({
      source: 'openapi-inline',
      file: '/tmp/openapi.yaml',
      format: 'yaml',
      content: [
        'openapi: 3.0.3',
        'components:',
        '  schemas:',
        '    CommonFields:',
        '      type: object',
        '      properties:',
        '        email:',
        '          type: string',
        '          format: email',
        '          minLength: 8',
        'paths: {}',
      ].join('\n'),
    }, 0);

    const shape = getComparableObjectShape(parsed, {
      type: 'object',
      properties: {
        email: {
          $ref: '#/components/schemas/CommonFields/properties/email',
        },
      },
    });

    expect(shape.properties.get('email')).toMatchObject({
      type: 'string',
      validation: {
        format: 'email',
        minLength: 8,
      },
    });
  });

  it('preserves allOf-wrapped union discriminators and common fields', () => {
    const parsed = parseDocument({
      source: 'openapi-inline',
      file: '/tmp/openapi.yaml',
      format: 'yaml',
      content: [
        'openapi: 3.0.3',
        'paths: {}',
      ].join('\n'),
    }, 0);

    const shape = getComparableObjectShape(parsed, {
      allOf: [
        {
          oneOf: [
            {
              type: 'object',
              required: ['kind', 'id'],
              properties: {
                kind: { type: 'string' },
                id: { type: 'string' },
                email: { type: 'string' },
              },
            },
            {
              type: 'object',
              required: ['kind', 'id'],
              properties: {
                kind: { type: 'string' },
                id: { type: 'string' },
                phone: { type: 'string' },
              },
            },
          ],
          discriminator: {
            propertyName: 'kind',
            mapping: {
              admin: '#/components/schemas/AdminUser',
              guest: '#/components/schemas/GuestUser',
            },
          },
        },
        {
          type: 'object',
          properties: {
            traceId: { type: 'string' },
          },
        },
      ],
    });

    expect(shape.discriminators.get('')).toEqual({
      propertyName: 'kind',
      mapping: {
        admin: '#/components/schemas/AdminUser',
        guest: '#/components/schemas/GuestUser',
      },
      mappingKeys: ['admin', 'guest'],
    });
    expect(Array.from(shape.properties.keys()).sort()).toEqual(['id', 'kind', 'traceId']);
    expect(Array.from(shape.required).sort()).toEqual(['id', 'kind']);
  });

  it('captures comparable numeric validation semantics for openapi fields', () => {
    const parsed = parseDocument({
      source: 'openapi-inline',
      file: '/tmp/openapi.yaml',
      format: 'yaml',
      content: [
        'openapi: 3.0.3',
        'paths: {}',
      ].join('\n'),
    }, 0);

    const shape = getComparableObjectShape(parsed, {
      type: 'object',
      properties: {
        quota: {
          type: 'number',
          minimum: 1,
          exclusiveMinimum: true,
          maximum: 100,
          exclusiveMaximum: true,
          multipleOf: 5,
        },
      },
    });

    expect(shape.properties.get('quota')).toMatchObject({
      type: 'number',
      validation: {
        minimum: 1,
        exclusiveMinimum: true,
        maximum: 100,
        exclusiveMaximum: true,
        multipleOf: 5,
      },
    });
  });
});
