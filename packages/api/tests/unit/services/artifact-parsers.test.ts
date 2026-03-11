import { describe, it, expect } from 'vitest';
import { parseArtifactInputs } from '../../../src/services/artifact-parsers/index.js';
import { artifactParserProfiles } from '../../../src/services/artifact-parsers/registry.js';

describe('artifact parsers', () => {
  it('should register native parser profiles', () => {
    expect(artifactParserProfiles.map((profile) => profile.id)).toEqual([
      'openapi-native',
      'schema-native',
    ]);
  });

  it('should merge native inputs with passthrough artifacts', () => {
    const parsed = parseArtifactInputs({
      openApiDocuments: [
        {
          source: 'openapi-inline',
          file: '/tmp/openapi.yaml',
          content: [
            'openapi: 3.0.3',
            'paths:',
            '  /users:',
            '    post:',
            "      responses: {'400': { description: bad request }}",
          ].join('\n'),
          format: 'yaml',
        },
      ],
      schemaDocuments: [
        {
          source: 'schema-inline',
          file: '/tmp/schema.prisma',
          content: 'model User { email String? }',
          format: 'prisma',
        },
      ],
      contractArtifacts: [
        {
          source: 'manual-contract',
          ruleId: 'contract/manual',
          message: 'manual contract finding',
        },
      ],
      schemaArtifacts: [
        {
          source: 'manual-schema',
          ruleId: 'schema/manual',
          message: 'manual schema finding',
        },
      ],
    });

    expect(parsed.contractArtifacts.map((item) => item.ruleId)).toEqual([
      'contract/openapi-operation-id',
      'contract/openapi-auth-required',
      'contract/openapi-success-response',
      'contract/manual',
    ]);

    expect(parsed.schemaArtifacts.map((item) => item.ruleId)).toEqual([
      'schema/prisma-sensitive-nullable',
      'schema/prisma-primary-key',
      'schema/manual',
    ]);
  });

  it('should support disabling native parsers via runtime config', () => {
    const parsed = parseArtifactInputs({
      openApiDocuments: [
        {
          source: 'openapi-inline',
          file: '/tmp/openapi.yaml',
          content: 'openapi: 3.0.3\npaths: {}\n',
          format: 'yaml',
        },
      ],
      schemaDocuments: [
        {
          source: 'schema-inline',
          file: '/tmp/schema.prisma',
          content: 'model User { email String? }',
          format: 'prisma',
        },
      ],
      runtimeConfig: {
        enableOpenApiNativeParser: false,
        enableSchemaNativeParser: false,
      },
    });

    expect(parsed.contractArtifacts).toHaveLength(0);
    expect(parsed.schemaArtifacts).toHaveLength(0);
  });
});
