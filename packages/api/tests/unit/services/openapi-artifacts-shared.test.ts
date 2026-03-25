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
});
