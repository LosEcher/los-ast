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
          content: ['model User {', '  email String?', '}'].join('\n'),
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

  it('should dedupe matching native parser findings against passthrough artifacts and prefer passthrough metadata', () => {
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
      contractArtifacts: [
        {
          source: 'manual-contract',
          ruleId: 'contract/openapi-operation-id',
          severity: 'error',
          message: 'OpenAPI operation POST /users is missing operationId',
          file: '/tmp/openapi.yaml',
          line: 1,
          column: 0,
          excerpt: 'manual override',
          governanceDomain: ['interface', 'backend', 'manual'],
          impactHint: 'high',
        },
      ],
    });

    expect(parsed.contractArtifacts).toHaveLength(3);
    expect(parsed.contractArtifacts.map((item) => item.ruleId)).toEqual([
      'contract/openapi-operation-id',
      'contract/openapi-auth-required',
      'contract/openapi-success-response',
    ]);
    expect(parsed.contractArtifacts[0]).toMatchObject({
      source: 'manual-contract',
      severity: 'error',
      excerpt: 'manual override',
      impactHint: 'high',
    });
  });

  it('should anchor native OpenAPI findings to the actual operation line', () => {
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
    });

    expect(parsed.contractArtifacts.map((item) => item.line)).toEqual([4, 4, 4]);
  });

  it('should anchor OpenAPI comparison findings to the changed operation line', () => {
    const parsed = parseArtifactInputs({
      openApiComparisons: [
        {
          source: 'openapi-compare-inline',
          file: '/tmp/openapi-compare.yaml',
          format: 'yaml',
          baseline: [
            'openapi: 3.0.3',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              type: object',
            '              properties:',
            '                email: { type: string }',
            '      responses:',
            "        '200':",
            '          description: ok',
          ].join('\n'),
          current: [
            'openapi: 3.0.3',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              type: object',
            '              required: [email, role]',
            '              properties:',
            '                email: { type: string }',
            '                role: { type: string }',
            '      responses:',
            "        '200':",
            '          description: ok',
          ].join('\n'),
        },
      ],
    });

    expect(parsed.contractArtifacts).toHaveLength(2);
    expect(parsed.contractArtifacts.map((item) => item.ruleId)).toEqual([
      'contract/openapi-breaking-request-required-add',
      'contract/openapi-breaking-request-required-add',
    ]);
    expect(parsed.contractArtifacts.map((item) => item.line)).toEqual([4, 4]);
  });

  it('should keep near-match passthrough artifacts when the message differs', () => {
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
      contractArtifacts: [
        {
          source: 'manual-contract',
          ruleId: 'contract/openapi-operation-id',
          message: 'OpenAPI operation POST /users is missing operationId (manual review)',
          file: '/tmp/openapi.yaml',
          line: 1,
          column: 0,
        },
      ],
    });

    expect(parsed.contractArtifacts).toHaveLength(4);
    expect(parsed.contractArtifacts.filter((item) => item.ruleId === 'contract/openapi-operation-id')).toHaveLength(2);
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
          content: ['model User {', '  email String?', '}'].join('\n'),
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

  it('should derive breaking schema findings from schemaComparisons', () => {
    const parsed = parseArtifactInputs({
      schemaComparisons: [
        {
          source: 'schema-compare',
          file: '/tmp/schema.prisma',
          format: 'prisma',
          baseline: [
            'model User {',
            '  email String?',
            '  status String',
            '  createdAt DateTime',
            '}',
          ].join('\n'),
          current: [
            'model User {',
            '  email String',
            '  status Int',
            '  createdAt DateTime',
            '}',
          ].join('\n'),
        },
      ],
    });

    expect(parsed.schemaArtifacts.map((item) => item.ruleId)).toEqual([
      'schema/prisma-breaking-nullability-tighten',
      'schema/prisma-breaking-type-change',
    ]);
  });

  it('should grade nullability tightening with defaults as warning in schemaComparisons', () => {
    const parsed = parseArtifactInputs({
      schemaComparisons: [
        {
          source: 'schema-compare-nullability-default',
          file: '/tmp/schema.prisma',
          format: 'prisma',
          baseline: [
            'model User {',
            '  id String @id',
            '  locale String?',
            '}',
          ].join('\n'),
          current: [
            'model User {',
            '  id String @id',
            '  locale String @default("zh-CN")',
            '}',
          ].join('\n'),
        },
      ],
    });

    expect(parsed.schemaArtifacts.map((item) => item.ruleId)).toEqual([
      'schema/prisma-nullability-tighten-with-default',
    ]);
    expect(parsed.schemaArtifacts[0].severity).toBe('warning');
    expect(parsed.schemaArtifacts[0].excerpt).toContain('User.locale');
  });

  it('should flag newly added required schema fields without defaults as breaking', () => {
    const parsed = parseArtifactInputs({
      schemaComparisons: [
        {
          source: 'schema-compare-add-required',
          file: '/tmp/schema.prisma',
          format: 'prisma',
          baseline: [
            'model User {',
            '  id String @id',
            '}',
          ].join('\n'),
          current: [
            'model User {',
            '  id String @id',
            '  email String',
            '}',
          ].join('\n'),
        },
      ],
    });

    expect(parsed.schemaArtifacts.map((item) => item.ruleId)).toEqual([
      'schema/prisma-breaking-add-required-field',
    ]);
  });

  it('should grade newly added required schema fields with defaults', () => {
    const parsed = parseArtifactInputs({
      schemaComparisons: [
        {
          source: 'schema-compare-add-required-default',
          file: '/tmp/schema.prisma',
          format: 'prisma',
          baseline: [
            'model User {',
            '  id String @id',
            '}',
          ].join('\n'),
          current: [
            'model User {',
            '  id String @id',
            '  email String @default("demo@example.com")',
            '}',
          ].join('\n'),
        },
      ],
    });

    expect(parsed.schemaArtifacts.map((item) => item.ruleId)).toEqual([
      'schema/prisma-add-required-field-with-default',
    ]);
    expect(parsed.schemaArtifacts[0].severity).toBe('warning');
  });

  it('should flag schema primary key changes in schemaComparisons', () => {
    const parsed = parseArtifactInputs({
      schemaComparisons: [
        {
          source: 'schema-compare-primary-key',
          file: '/tmp/schema.sql',
          format: 'sql',
          baseline: [
            'CREATE TABLE users (',
            '  id TEXT NOT NULL,',
            '  email TEXT,',
            '  PRIMARY KEY (id)',
            ');',
          ].join('\n'),
          current: [
            'CREATE TABLE users (',
            '  id TEXT NOT NULL,',
            '  email TEXT NOT NULL,',
            '  PRIMARY KEY (email)',
            ');',
          ].join('\n'),
        },
      ],
    });

    expect(parsed.schemaArtifacts.map((item) => item.ruleId)).toEqual([
      'schema/sql-breaking-primary-key-change',
      'schema/sql-breaking-nullability-tighten',
    ]);
  });

  it('should treat equivalent sql timestamp and uuid defaults as compatible in schemaComparisons', () => {
    const parsed = parseArtifactInputs({
      schemaComparisons: [
        {
          source: 'schema-compare-sql-default-equivalence',
          file: '/tmp/schema.sql',
          format: 'sql',
          baseline: [
            'CREATE TABLE users (',
            '  id TEXT NOT NULL DEFAULT uuid_generate_v4(),',
            '  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(3),',
            '  PRIMARY KEY (id)',
            ');',
          ].join('\n'),
          current: [
            'CREATE TABLE users (',
            '  id TEXT NOT NULL DEFAULT gen_random_uuid(),',
            '  created_at TIMESTAMP NOT NULL DEFAULT (now()),',
            '  PRIMARY KEY (id)',
            ');',
          ].join('\n'),
        },
      ],
    });

    expect(parsed.schemaArtifacts).toHaveLength(0);
  });

  it('should treat common sql type synonyms as compatible in schemaComparisons', () => {
    const parsed = parseArtifactInputs({
      schemaComparisons: [
        {
          source: 'schema-compare-sql-type-synonyms',
          file: '/tmp/schema.sql',
          format: 'sql',
          baseline: [
            'CREATE TABLE users (',
            '  age INT,',
            '  is_active BOOL,',
            '  balance DECIMAL(10, 2)',
            ');',
          ].join('\n'),
          current: [
            'CREATE TABLE users (',
            '  age INTEGER,',
            '  is_active BOOLEAN,',
            '  balance NUMERIC(10,2)',
            ');',
          ].join('\n'),
        },
      ],
    });

    expect(parsed.schemaArtifacts).toHaveLength(0);
  });

  it('should bind schema findings to the correct entity without duplicating multi-entity documents', () => {
    const parsed = parseArtifactInputs({
      schemaDocuments: [
        {
          source: 'schema-multi-entity',
          file: '/tmp/schema.prisma',
          format: 'prisma',
          content: [
            'model User {',
            '  id String @id',
            '  email String?',
            '}',
            '',
            'model AuditLog {',
            '  id String @id',
            '  status String',
            '}',
          ].join('\n'),
        },
      ],
    });

    expect(parsed.schemaArtifacts.map((item) => item.message)).toEqual([
      'Sensitive field User.email should not be optional',
      'Lifecycle field AuditLog.status should declare @default(...)',
    ]);
  });

  it('should treat equivalent prisma uuid and dbgenerated defaults as compatible in schemaComparisons', () => {
    const parsed = parseArtifactInputs({
      schemaComparisons: [
        {
          source: 'schema-compare-prisma-default-equivalence',
          file: '/tmp/schema.prisma',
          format: 'prisma',
          baseline: [
            'model User {',
            '  id String @id @default(uuid())',
            '  createdAt DateTime @default(now())',
            '}',
          ].join('\n'),
          current: [
            'model User {',
            '  id String @id @default(dbgenerated("gen_random_uuid()"))',
            '  createdAt DateTime @default(dbgenerated("CURRENT_TIMESTAMP(3)"))',
            '}',
          ].join('\n'),
        },
      ],
    });

    expect(parsed.schemaArtifacts).toHaveLength(0);
  });

  it('should grade field-level unique drift in schemaComparisons', () => {
    const parsed = parseArtifactInputs({
      schemaComparisons: [
        {
          source: 'schema-compare-unique-field',
          file: '/tmp/schema.prisma',
          format: 'prisma',
          baseline: [
            'model User {',
            '  id String @id',
            '  email String @unique',
            '  username String',
            '}',
          ].join('\n'),
          current: [
            'model User {',
            '  id String @id',
            '  email String',
            '  username String @unique',
            '}',
          ].join('\n'),
        },
      ],
    });

    expect(parsed.schemaArtifacts.map((item) => item.ruleId)).toEqual([
      'schema/prisma-unique-removed',
      'schema/prisma-unique-added',
    ]);
    expect(parsed.schemaArtifacts.map((item) => item.severity)).toEqual(['info', 'warning']);
  });

  it('should grade composite unique drift in schemaComparisons', () => {
    const parsed = parseArtifactInputs({
      schemaComparisons: [
        {
          source: 'schema-compare-composite-unique',
          file: '/tmp/schema.sql',
          format: 'sql',
          baseline: [
            'CREATE TABLE users (',
            '  id TEXT NOT NULL,',
            '  email TEXT NOT NULL,',
            '  tenant_id TEXT NOT NULL,',
            '  PRIMARY KEY (id),',
            '  UNIQUE (email, tenant_id)',
            ');',
          ].join('\n'),
          current: [
            'CREATE TABLE users (',
            '  id TEXT NOT NULL,',
            '  email TEXT NOT NULL,',
            '  tenant_id TEXT NOT NULL,',
            '  slug TEXT NOT NULL,',
            '  PRIMARY KEY (id),',
            '  UNIQUE (slug, tenant_id)',
            ');',
          ].join('\n'),
        },
      ],
    });

    expect(parsed.schemaArtifacts.map((item) => item.ruleId)).toEqual([
      'schema/sql-composite-unique-removed',
      'schema/sql-composite-unique-added',
      'schema/sql-breaking-add-required-field',
    ]);
  });

  it('should derive request-shape and operation-drop findings from openApiComparisons', () => {
    const parsed = parseArtifactInputs({
      openApiComparisons: [
        {
          source: 'openapi-compare',
          file: '/tmp/openapi.yaml',
          format: 'yaml',
          baseline: [
            'openapi: 3.0.3',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              type: object',
            '              properties:',
            '                email: { type: string }',
            '                nickname: { type: string }',
            '      responses:',
            "        '200':",
            '          description: ok',
            '          content:',
            '            application/json:',
            '              schema:',
            '                type: object',
            '                required: [id]',
            '                properties:',
            '                  id: { type: string }',
            '  /sessions:',
            '    get:',
            '      responses:',
            "        '200':",
            '          description: ok',
          ].join('\n'),
          current: [
            'openapi: 3.0.3',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              type: object',
            '              required: [email]',
            '              properties:',
            '                email: { type: integer }',
            '      responses:',
            "        '200':",
            '          description: ok',
            '          content:',
            '            application/json:',
            '              schema:',
            '                type: object',
            '                properties:',
            '                  id: { type: string }',
          ].join('\n'),
        },
      ],
    });

    expect(parsed.contractArtifacts.map((item) => item.ruleId)).toEqual([
      'contract/openapi-breaking-request-field-type-change',
      'contract/openapi-breaking-request-field-drop',
      'contract/openapi-breaking-request-required-add',
      'contract/openapi-breaking-response-required-drop',
      'contract/openapi-breaking-operation-drop',
    ]);
    expect(parsed.contractArtifacts[3].excerpt).toContain('response[200].id');
  });

  it('should resolve common fields across oneOf variants in openApiComparisons', () => {
    const parsed = parseArtifactInputs({
      openApiComparisons: [
        {
          source: 'openapi-compare-oneof',
          file: '/tmp/openapi-oneof.yaml',
          format: 'yaml',
          baseline: [
            'openapi: 3.0.3',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              oneOf:',
            '                - type: object',
            '                  required: [kind, age]',
            '                  properties:',
            '                    kind: { type: string }',
            '                    age: { type: integer }',
            '                    email: { type: string }',
            '                - type: object',
            '                  required: [kind, age]',
            '                  properties:',
            '                    kind: { type: string }',
            '                    age: { type: integer }',
            '                    phone: { type: string }',
            '      responses:',
            "        '200':",
            '          description: ok',
          ].join('\n'),
          current: [
            'openapi: 3.0.3',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              oneOf:',
            '                - type: object',
            '                  required: [kind, age]',
            '                  properties:',
            '                    kind: { type: string }',
            '                    age: { type: string }',
            '                    email: { type: string }',
            '                - type: object',
            '                  required: [kind, age]',
            '                  properties:',
            '                    kind: { type: string }',
            '                    age: { type: string }',
            '                    phone: { type: string }',
            '      responses:',
            "        '200':",
            '          description: ok',
          ].join('\n'),
        },
      ],
    });

    expect(parsed.contractArtifacts.map((item) => item.ruleId)).toEqual([
      'contract/openapi-breaking-request-field-type-change',
    ]);
    expect(parsed.contractArtifacts[0].message).toContain('request field age type from integer to string');
  });

  it('should compare top-level array item object shapes in openApiComparisons', () => {
    const parsed = parseArtifactInputs({
      openApiComparisons: [
        {
          source: 'openapi-compare-array',
          file: '/tmp/openapi-array.yaml',
          format: 'yaml',
          baseline: [
            'openapi: 3.0.3',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              type: array',
            '              items:',
            '                type: object',
            '                properties:',
            '                  age: { type: integer }',
            '      responses:',
            "        '200':",
            '          description: ok',
            '          content:',
            '            application/json:',
            '              schema:',
            '                type: array',
            '                items:',
            '                  type: object',
            '                  required: [id]',
            '                  properties:',
            '                    id: { type: string }',
          ].join('\n'),
          current: [
            'openapi: 3.0.3',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              type: array',
            '              items:',
            '                type: object',
            '                properties:',
            '                  age: { type: string }',
            '      responses:',
            "        '200':",
            '          description: ok',
            '          content:',
            '            application/json:',
            '              schema:',
            '                type: array',
            '                items:',
            '                  type: object',
            '                  properties:',
            '                    id: { type: string }',
          ].join('\n'),
        },
      ],
    });

    expect(parsed.contractArtifacts.map((item) => item.ruleId)).toEqual([
      'contract/openapi-breaking-request-field-type-change',
      'contract/openapi-breaking-response-required-drop',
    ]);
    expect(parsed.contractArtifacts[0].excerpt).toContain('request[].age');
    expect(parsed.contractArtifacts[1].excerpt).toContain('response[200][].id');
  });

  it('should resolve local refs across oneOf response variants in openApiComparisons', () => {
    const parsed = parseArtifactInputs({
      openApiComparisons: [
        {
          source: 'openapi-compare-response-oneof-ref',
          file: '/tmp/openapi-response-oneof-ref.yaml',
          format: 'yaml',
          baseline: [
            'openapi: 3.0.3',
            'components:',
            '  schemas:',
            '    UserA:',
            '      type: object',
            '      required: [kind, age]',
            '      properties:',
            '        kind: { type: string }',
            '        age: { type: integer }',
            '        email: { type: string }',
            '    UserB:',
            '      type: object',
            '      required: [kind, age]',
            '      properties:',
            '        kind: { type: string }',
            '        age: { type: integer }',
            '        phone: { type: string }',
            'paths:',
            '  /users:',
            '    get:',
            '      responses:',
            "        '200':",
            '          description: ok',
            '          content:',
            '            application/json:',
            '              schema:',
            '                oneOf:',
            "                  - $ref: '#/components/schemas/UserA'",
            "                  - $ref: '#/components/schemas/UserB'",
          ].join('\n'),
          current: [
            'openapi: 3.0.3',
            'components:',
            '  schemas:',
            '    UserA:',
            '      type: object',
            '      required: [kind]',
            '      properties:',
            '        kind: { type: string }',
            '        age: { type: string }',
            '        email: { type: string }',
            '    UserB:',
            '      type: object',
            '      required: [kind, age]',
            '      properties:',
            '        kind: { type: string }',
            '        age: { type: string }',
            '        phone: { type: string }',
            'paths:',
            '  /users:',
            '    get:',
            '      responses:',
            "        '200':",
            '          description: ok',
            '          content:',
            '            application/json:',
            '              schema:',
            '                oneOf:',
            "                  - $ref: '#/components/schemas/UserA'",
            "                  - $ref: '#/components/schemas/UserB'",
          ].join('\n'),
        },
      ],
    });

    expect(parsed.contractArtifacts.map((item) => item.ruleId)).toEqual([
      'contract/openapi-breaking-response-field-type-change',
      'contract/openapi-breaking-response-required-drop',
    ]);
    expect(parsed.contractArtifacts[0].message).toContain('response field age type from integer to string');
    expect(parsed.contractArtifacts[0].excerpt).toContain('response[200].age');
  });

  it('should compare nested object and array item paths in openApiComparisons', () => {
    const parsed = parseArtifactInputs({
      openApiComparisons: [
        {
          source: 'openapi-compare-nested',
          file: '/tmp/openapi-nested.yaml',
          format: 'yaml',
          baseline: [
            'openapi: 3.0.3',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              type: object',
            '              required: [profile]',
            '              properties:',
            '                profile:',
            '                  type: object',
            '                  required: [age]',
            '                  properties:',
            '                    age: { type: integer }',
            '      responses:',
            "        '200':",
            '          description: ok',
            '          content:',
            '            application/json:',
            '              schema:',
            '                type: object',
            '                required: [users]',
            '                properties:',
            '                  users:',
            '                    type: array',
            '                    items:',
            '                      type: object',
            '                      required: [id]',
            '                      properties:',
            '                        id: { type: string }',
          ].join('\n'),
          current: [
            'openapi: 3.0.3',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              type: object',
            '              required: [profile]',
            '              properties:',
            '                profile:',
            '                  type: object',
            '                  required: [age]',
            '                  properties:',
            '                    age: { type: string }',
            '      responses:',
            "        '200':",
            '          description: ok',
            '          content:',
            '            application/json:',
            '              schema:',
            '                type: object',
            '                required: [users]',
            '                properties:',
            '                  users:',
            '                    type: array',
            '                    items:',
            '                      type: object',
            '                      properties:',
            '                        id: { type: string }',
          ].join('\n'),
        },
      ],
    });

    expect(parsed.contractArtifacts.map((item) => item.ruleId)).toEqual([
      'contract/openapi-breaking-request-field-type-change',
      'contract/openapi-breaking-response-required-drop',
    ]);
    expect(parsed.contractArtifacts[0].excerpt).toContain('request.profile.age');
    expect(parsed.contractArtifacts[1].excerpt).toContain('response[200].users[].id');
  });

  it('should resolve nested ref, allOf and oneOf array paths in openApiComparisons', () => {
    const parsed = parseArtifactInputs({
      openApiComparisons: [
        {
          source: 'openapi-compare-nested-composed',
          file: '/tmp/openapi-nested-composed.yaml',
          format: 'yaml',
          baseline: [
            'openapi: 3.0.3',
            'components:',
            '  schemas:',
            '    BaseProfile:',
            '      type: object',
            '      required: [age]',
            '      properties:',
            '        age: { type: integer }',
            '    ExtendedProfile:',
            '      allOf:',
            "        - $ref: '#/components/schemas/BaseProfile'",
            '        - type: object',
            '          properties:',
            '            nickname: { type: string }',
            '    UserA:',
            '      type: object',
            '      required: [id]',
            '      properties:',
            '        id: { type: integer }',
            '        email: { type: string }',
            '    UserB:',
            '      type: object',
            '      required: [id]',
            '      properties:',
            '        id: { type: integer }',
            '        phone: { type: string }',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              type: object',
            '              required: [profile]',
            '              properties:',
            '                profile:',
            "                  $ref: '#/components/schemas/ExtendedProfile'",
            '      responses:',
            "        '200':",
            '          description: ok',
            '          content:',
            '            application/json:',
            '              schema:',
            '                type: object',
            '                required: [users]',
            '                properties:',
            '                  users:',
            '                    type: array',
            '                    items:',
            '                      oneOf:',
            "                        - $ref: '#/components/schemas/UserA'",
            "                        - $ref: '#/components/schemas/UserB'",
          ].join('\n'),
          current: [
            'openapi: 3.0.3',
            'components:',
            '  schemas:',
            '    BaseProfile:',
            '      type: object',
            '      required: [age]',
            '      properties:',
            '        age: { type: string }',
            '    ExtendedProfile:',
            '      allOf:',
            "        - $ref: '#/components/schemas/BaseProfile'",
            '        - type: object',
            '          properties:',
            '            nickname: { type: string }',
            '    UserA:',
            '      type: object',
            '      required: [id]',
            '      properties:',
            '        id: { type: string }',
            '        email: { type: string }',
            '    UserB:',
            '      type: object',
            '      required: [id]',
            '      properties:',
            '        id: { type: string }',
            '        phone: { type: string }',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              type: object',
            '              required: [profile]',
            '              properties:',
            '                profile:',
            "                  $ref: '#/components/schemas/ExtendedProfile'",
            '      responses:',
            "        '200':",
            '          description: ok',
            '          content:',
            '            application/json:',
            '              schema:',
            '                type: object',
            '                required: [users]',
            '                properties:',
            '                  users:',
            '                    type: array',
            '                    items:',
            '                      oneOf:',
            "                        - $ref: '#/components/schemas/UserA'",
            "                        - $ref: '#/components/schemas/UserB'",
          ].join('\n'),
        },
      ],
    });

    expect(parsed.contractArtifacts.map((item) => item.ruleId)).toEqual([
      'contract/openapi-breaking-request-field-type-change',
      'contract/openapi-breaking-response-field-type-change',
    ]);
    expect(parsed.contractArtifacts[0].excerpt).toContain('request.profile.age');
    expect(parsed.contractArtifacts[1].excerpt).toContain('response[200].users[].id');
  });

  it('should compare additionalProperties map-like paths in openApiComparisons', () => {
    const parsed = parseArtifactInputs({
      openApiComparisons: [
        {
          source: 'openapi-compare-map-like',
          file: '/tmp/openapi-map-like.yaml',
          format: 'yaml',
          baseline: [
            'openapi: 3.0.3',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              type: object',
            '              required: [metadata]',
            '              properties:',
            '                metadata:',
            '                  type: object',
            '                  additionalProperties:',
            '                    type: integer',
            '      responses:',
            "        '200':",
            '          description: ok',
            '          content:',
            '            application/json:',
            '              schema:',
            '                type: object',
            '                required: [profiles]',
            '                properties:',
            '                  profiles:',
            '                    type: object',
            '                    additionalProperties:',
            '                      type: object',
            '                      required: [id]',
            '                      properties:',
            '                        id: { type: string }',
          ].join('\n'),
          current: [
            'openapi: 3.0.3',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              type: object',
            '              required: [metadata]',
            '              properties:',
            '                metadata:',
            '                  type: object',
            '                  additionalProperties:',
            '                    type: string',
            '      responses:',
            "        '200':",
            '          description: ok',
            '          content:',
            '            application/json:',
            '              schema:',
            '                type: object',
            '                required: [profiles]',
            '                properties:',
            '                  profiles:',
            '                    type: object',
            '                    additionalProperties:',
            '                      type: object',
            '                      properties:',
            '                        id: { type: string }',
          ].join('\n'),
        },
      ],
    });

    expect(parsed.contractArtifacts.map((item) => item.ruleId)).toEqual([
      'contract/openapi-breaking-request-field-type-change',
      'contract/openapi-breaking-response-required-drop',
    ]);
    expect(parsed.contractArtifacts[0].excerpt).toContain('request.metadata.*');
    expect(parsed.contractArtifacts[1].excerpt).toContain('response[200].profiles.*.id');
  });

  it('should compare nullable enum and default drift in openApiComparisons', () => {
    const parsed = parseArtifactInputs({
      openApiComparisons: [
        {
          source: 'openapi-compare-value-semantics',
          file: '/tmp/openapi-value-semantics.yaml',
          format: 'yaml',
          baseline: [
            'openapi: 3.0.3',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              type: object',
            '              required: [email]',
            '              properties:',
            '                status:',
            '                  type: string',
            '                  nullable: true',
            '                  enum: [active, disabled, archived]',
            '                  default: active',
            '      responses:',
            "        '200':",
            '          description: ok',
            '          content:',
            '            application/json:',
            '              schema:',
            '                type: object',
            '                properties:',
            '                  state:',
            '                    type: string',
            '                    nullable: true',
            '                    enum: [queued, done]',
            '                    default: queued',
          ].join('\n'),
          current: [
            'openapi: 3.0.3',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              type: object',
            '              properties:',
            '                status:',
            '                  type: string',
            '                  enum: [active, disabled]',
            '                  default: disabled',
            '      responses:',
            "        '200':",
            '          description: ok',
            '          content:',
            '            application/json:',
            '              schema:',
            '                type: object',
            '                properties:',
            '                  state:',
            '                    type: string',
            '                    enum: [queued]',
          ].join('\n'),
        },
      ],
    });

    expect(parsed.contractArtifacts.map((item) => item.ruleId)).toEqual([
      'contract/openapi-breaking-request-nullable-tighten',
      'contract/openapi-breaking-request-enum-value-drop',
      'contract/openapi-request-default-changed',
      'contract/openapi-breaking-response-nullable-tighten',
      'contract/openapi-breaking-response-enum-value-drop',
      'contract/openapi-response-default-removed',
    ]);
    expect(parsed.contractArtifacts[0].excerpt).toContain('request.status');
    expect(parsed.contractArtifacts[4].excerpt).toContain('response[200].state');
  });

  it('should compare discriminator property and mapping drift in openApiComparisons', () => {
    const parsed = parseArtifactInputs({
      openApiComparisons: [
        {
          source: 'openapi-compare-discriminator',
          file: '/tmp/openapi-discriminator.yaml',
          format: 'yaml',
          baseline: [
            'openapi: 3.0.3',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              oneOf:',
            '                - type: object',
            '                  properties:',
            '                    kind: { type: string }',
            '                    type: { type: string }',
            '                    id: { type: string }',
            '                - type: object',
            '                  properties:',
            '                    kind: { type: string }',
            '                    type: { type: string }',
            '                    id: { type: string }',
            '              discriminator:',
            '                propertyName: kind',
            '                mapping:',
            "                  admin: '#/components/schemas/AdminUser'",
            "                  guest: '#/components/schemas/GuestUser'",
            '      responses:',
            "        '200':",
            '          description: ok',
            '          content:',
            '            application/json:',
            '              schema:',
            '                oneOf:',
            '                  - type: object',
            '                    properties:',
            '                      status: { type: string }',
            '                      id: { type: string }',
            '                  - type: object',
            '                    properties:',
            '                      status: { type: string }',
            '                      id: { type: string }',
            '                discriminator:',
            '                  propertyName: status',
            '                  mapping:',
            "                    active: '#/components/schemas/ActiveUser'",
            "                    disabled: '#/components/schemas/DisabledUser'",
          ].join('\n'),
          current: [
            'openapi: 3.0.3',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              oneOf:',
            '                - type: object',
            '                  properties:',
            '                    kind: { type: string }',
            '                    type: { type: string }',
            '                    id: { type: string }',
            '                - type: object',
            '                  properties:',
            '                    kind: { type: string }',
            '                    type: { type: string }',
            '                    id: { type: string }',
            '              discriminator:',
            '                propertyName: type',
            '                mapping:',
            "                  admin: '#/components/schemas/AdminUser'",
            '      responses:',
            "        '200':",
            '          description: ok',
            '          content:',
            '            application/json:',
            '              schema:',
            '                oneOf:',
            '                  - type: object',
            '                    properties:',
            '                      status: { type: string }',
            '                      id: { type: string }',
            '                  - type: object',
            '                    properties:',
            '                      status: { type: string }',
            '                      id: { type: string }',
            '                discriminator:',
            '                  propertyName: status',
            '                  mapping:',
            "                    active: '#/components/schemas/ActiveUser'",
          ].join('\n'),
        },
      ],
    });

    expect(parsed.contractArtifacts.map((item) => item.ruleId)).toEqual([
      'contract/openapi-breaking-request-discriminator-change',
      'contract/openapi-breaking-request-discriminator-value-drop',
      'contract/openapi-breaking-response-discriminator-value-drop',
    ]);
    expect(parsed.contractArtifacts[0].excerpt).toContain('request#discriminator.kind');
    expect(parsed.contractArtifacts[2].excerpt).toContain('response[200]#discriminator.status');
  });

  it('should downgrade added required request fields when a default is present', () => {
    const parsed = parseArtifactInputs({
      openApiComparisons: [
        {
          source: 'openapi-compare-required-default',
          file: '/tmp/openapi-required-default.yaml',
          format: 'yaml',
          baseline: [
            'openapi: 3.0.3',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              type: object',
            '              required: [email]',
            '              properties:',
            '                email: { type: string }',
            '      responses:',
            "        '200':",
            '          description: ok',
          ].join('\n'),
          current: [
            'openapi: 3.0.3',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              type: object',
            '              required: [email, locale]',
            '              properties:',
            '                email: { type: string }',
            '                locale:',
            '                  type: string',
            '                  default: zh-CN',
            '      responses:',
            "        '200':",
            '          description: ok',
          ].join('\n'),
        },
      ],
    });

    expect(parsed.contractArtifacts.map((item) => item.ruleId)).toEqual([
      'contract/openapi-request-required-add-with-default',
    ]);
    expect(parsed.contractArtifacts[0].severity).toBe('warning');
    expect(parsed.contractArtifacts[0].excerpt).toContain('request.locale');
  });

  it('should compare allOf additionalProperties nullable drift across nested paths', () => {
    const parsed = parseArtifactInputs({
      openApiComparisons: [
        {
          source: 'openapi-compare-cross-boundary',
          file: '/tmp/openapi-cross-boundary.yaml',
          format: 'yaml',
          baseline: [
            'openapi: 3.0.3',
            'components:',
            '  schemas:',
            '    MetadataBase:',
            '      type: object',
            '      additionalProperties:',
            '        type: string',
            '        nullable: true',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              type: object',
            '              required: [metadata]',
            '              properties:',
            '                metadata:',
            '                  allOf:',
            "                    - $ref: '#/components/schemas/MetadataBase'",
            '                    - type: object',
            '      responses:',
            "        '200':",
            '          description: ok',
          ].join('\n'),
          current: [
            'openapi: 3.0.3',
            'components:',
            '  schemas:',
            '    MetadataBase:',
            '      type: object',
            '      additionalProperties:',
            '        type: string',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              type: object',
            '              required: [metadata]',
            '              properties:',
            '                metadata:',
            '                  allOf:',
            "                    - $ref: '#/components/schemas/MetadataBase'",
            '                    - type: object',
            '      responses:',
            "        '200':",
            '          description: ok',
          ].join('\n'),
        },
      ],
    });

    expect(parsed.contractArtifacts.map((item) => item.ruleId)).toEqual([
      'contract/openapi-breaking-request-nullable-tighten',
    ]);
    expect(parsed.contractArtifacts[0].excerpt).toContain('request.metadata.*');
  });

  it('should compare nested discriminator paths inside object and array items', () => {
    const parsed = parseArtifactInputs({
      openApiComparisons: [
        {
          source: 'openapi-compare-nested-discriminator',
          file: '/tmp/openapi-nested-discriminator.yaml',
          format: 'yaml',
          baseline: [
            'openapi: 3.0.3',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              type: object',
            '              properties:',
            '                payload:',
            '                  oneOf:',
            '                    - type: object',
            '                      properties:',
            '                        kind: { type: string }',
            '                        id: { type: string }',
            '                    - type: object',
            '                      properties:',
            '                        kind: { type: string }',
            '                        id: { type: string }',
            '                  discriminator:',
            '                    propertyName: kind',
            '                    mapping:',
            "                      a: '#/components/schemas/A'",
            "                      b: '#/components/schemas/B'",
            '      responses:',
            "        '200':",
            '          description: ok',
            '          content:',
            '            application/json:',
            '              schema:',
            '                type: object',
            '                properties:',
            '                  users:',
            '                    type: array',
            '                    items:',
            '                      oneOf:',
            '                        - type: object',
            '                          properties:',
            '                            status: { type: string }',
            '                            id: { type: string }',
            '                        - type: object',
            '                          properties:',
            '                            status: { type: string }',
            '                            id: { type: string }',
            '                      discriminator:',
            '                        propertyName: status',
            '                        mapping:',
            "                          active: '#/components/schemas/ActiveUser'",
            "                          disabled: '#/components/schemas/DisabledUser'",
          ].join('\n'),
          current: [
            'openapi: 3.0.3',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              type: object',
            '              properties:',
            '                payload:',
            '                  oneOf:',
            '                    - type: object',
            '                      properties:',
            '                        kind: { type: string }',
            '                        id: { type: string }',
            '                    - type: object',
            '                      properties:',
            '                        kind: { type: string }',
            '                        id: { type: string }',
            '                  discriminator:',
            '                    propertyName: kind',
            '                    mapping:',
            "                      a: '#/components/schemas/A'",
            '      responses:',
            "        '200':",
            '          description: ok',
            '          content:',
            '            application/json:',
            '              schema:',
            '                type: object',
            '                properties:',
            '                  users:',
            '                    type: array',
            '                    items:',
            '                      oneOf:',
            '                        - type: object',
            '                          properties:',
            '                            status: { type: string }',
            '                            id: { type: string }',
            '                        - type: object',
            '                          properties:',
            '                            status: { type: string }',
            '                            id: { type: string }',
            '                      discriminator:',
            '                        propertyName: state',
            '                        mapping:',
            "                          active: '#/components/schemas/ActiveUser'",
            "                          disabled: '#/components/schemas/DisabledUser'",
          ].join('\n'),
        },
      ],
    });

    expect(parsed.contractArtifacts.map((item) => item.ruleId)).toEqual([
      'contract/openapi-breaking-request-discriminator-value-drop',
      'contract/openapi-breaking-response-discriminator-change',
    ]);
    expect(parsed.contractArtifacts[0].excerpt).toContain('request.payload#discriminator.kind');
    expect(parsed.contractArtifacts[1].excerpt).toContain('response[200].users[]#discriminator.status');
  });

  it('should compare allOf-wrapped discriminator unions in openApiComparisons', () => {
    const parsed = parseArtifactInputs({
      openApiComparisons: [
        {
          source: 'openapi-compare-allof-discriminator',
          file: '/tmp/openapi-allof-discriminator.yaml',
          format: 'yaml',
          baseline: [
            'openapi: 3.0.3',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              allOf:',
            '                - oneOf:',
            '                    - type: object',
            '                      properties:',
            '                        kind: { type: string }',
            '                        id: { type: string }',
            '                    - type: object',
            '                      properties:',
            '                        kind: { type: string }',
            '                        id: { type: string }',
            '                  discriminator:',
            '                    propertyName: kind',
            '                    mapping:',
            "                      admin: '#/components/schemas/AdminUser'",
            "                      guest: '#/components/schemas/GuestUser'",
            '                - type: object',
            '                  properties:',
            '                    traceId: { type: string }',
            '      responses:',
            "        '200':",
            '          description: ok',
            '          content:',
            '            application/json:',
            '              schema:',
            '                allOf:',
            '                  - oneOf:',
            '                      - type: object',
            '                        properties:',
            '                          status: { type: string }',
            '                          id: { type: string }',
            '                      - type: object',
            '                        properties:',
            '                          status: { type: string }',
            '                          id: { type: string }',
            '                    discriminator:',
            '                      propertyName: status',
            '                      mapping:',
            "                        active: '#/components/schemas/ActiveUser'",
            "                        disabled: '#/components/schemas/DisabledUser'",
            '                  - type: object',
            '                    properties:',
            '                      traceId: { type: string }',
          ].join('\n'),
          current: [
            'openapi: 3.0.3',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              allOf:',
            '                - oneOf:',
            '                    - type: object',
            '                      properties:',
            '                        kind: { type: string }',
            '                        type: { type: string }',
            '                        id: { type: string }',
            '                    - type: object',
            '                      properties:',
            '                        kind: { type: string }',
            '                        type: { type: string }',
            '                        id: { type: string }',
            '                  discriminator:',
            '                    propertyName: type',
            '                    mapping:',
            "                      admin: '#/components/schemas/AdminUser'",
            '                - type: object',
            '                  properties:',
            '                    traceId: { type: string }',
            '      responses:',
            "        '200':",
            '          description: ok',
            '          content:',
            '            application/json:',
            '              schema:',
            '                allOf:',
            '                  - oneOf:',
            '                      - type: object',
            '                        properties:',
            '                          status: { type: string }',
            '                          id: { type: string }',
            '                      - type: object',
            '                        properties:',
            '                          status: { type: string }',
            '                          id: { type: string }',
            '                    discriminator:',
            '                      propertyName: status',
            '                      mapping:',
            "                        active: '#/components/schemas/ActiveUser'",
            '                  - type: object',
            '                    properties:',
            '                      traceId: { type: string }',
          ].join('\n'),
        },
      ],
    });

    expect(parsed.contractArtifacts.map((item) => item.ruleId)).toEqual([
      'contract/openapi-breaking-request-discriminator-change',
      'contract/openapi-breaking-request-discriminator-value-drop',
      'contract/openapi-breaking-response-discriminator-value-drop',
    ]);
    expect(parsed.contractArtifacts[0].excerpt).toContain('request#discriminator.kind');
    expect(parsed.contractArtifacts[2].excerpt).toContain('response[200]#discriminator.status');
  });

  it('should align response comparisons by success status code', () => {
    const parsed = parseArtifactInputs({
      openApiComparisons: [
        {
          source: 'openapi-compare-status',
          file: '/tmp/openapi-status.yaml',
          format: 'yaml',
          baseline: [
            'openapi: 3.0.3',
            'paths:',
            '  /users:',
            '    post:',
            '      responses:',
            "        '200':",
            '          description: ok',
            '          content:',
            '            application/json:',
            '              schema:',
            '                type: object',
            '                required: [id]',
            '                properties:',
            '                  id: { type: string }',
          ].join('\n'),
          current: [
            'openapi: 3.0.3',
            'paths:',
            '  /users:',
            '    post:',
            '      responses:',
            "        '201':",
            '          description: created',
            '          content:',
            '            application/json:',
            '              schema:',
            '                type: object',
            '                required: [id]',
            '                properties:',
            '                  id: { type: string }',
          ].join('\n'),
        },
      ],
    });

    expect(parsed.contractArtifacts.map((item) => item.ruleId)).toEqual([
      'contract/openapi-breaking-response-status-drop',
    ]);
    expect(parsed.contractArtifacts[0].excerpt).toContain('response[200]');
  });

  it('should detect request validation tightening and response validation weakening on comparable fields', () => {
    const parsed = parseArtifactInputs({
      openApiComparisons: [
        {
          source: 'openapi-compare-validation-semantics',
          file: '/tmp/openapi-validation-semantics.yaml',
          format: 'yaml',
          baseline: [
            'openapi: 3.0.3',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              type: object',
            '              properties:',
            '                email:',
            '                  type: string',
            '                  minLength: 3',
            '      responses:',
            "        '200':",
            '          description: ok',
            '          content:',
            '            application/json:',
            '              schema:',
            '                type: object',
            '                properties:',
            '                  status:',
            '                    type: string',
            '                    pattern: "^(queued|done)$"',
          ].join('\n'),
          current: [
            'openapi: 3.0.3',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              type: object',
            '              properties:',
            '                email:',
            '                  type: string',
            '                  minLength: 8',
            '                  format: email',
            '      responses:',
            "        '200':",
            '          description: ok',
            '          content:',
            '            application/json:',
            '              schema:',
            '                type: object',
            '                properties:',
            '                  status:',
            '                    type: string',
          ].join('\n'),
        },
      ],
    });

    expect(parsed.contractArtifacts.map((item) => item.ruleId)).toEqual([
      'contract/openapi-breaking-request-validation-tighten',
      'contract/openapi-breaking-response-validation-weaken',
    ]);
    expect(parsed.contractArtifacts[0].excerpt).toContain('request.email');
    expect(parsed.contractArtifacts[0].excerpt).toContain('minLength 3 -> 8');
    expect(parsed.contractArtifacts[0].excerpt).toContain('format unset -> email');
    expect(parsed.contractArtifacts[1].excerpt).toContain('response[200].status');
    expect(parsed.contractArtifacts[1].excerpt).toContain('pattern ^(queued|done)$ -> unset');
  });

  it('should resolve local json-pointer refs inside comparison schemas', () => {
    const parsed = parseArtifactInputs({
      openApiComparisons: [
        {
          source: 'openapi-compare-json-pointer-refs',
          file: '/tmp/openapi-json-pointer-refs.yaml',
          format: 'yaml',
          baseline: [
            'openapi: 3.0.3',
            'components:',
            '  schemas:',
            '    SharedFields:',
            '      type: object',
            '      properties:',
            '        email:',
            '          type: string',
            '          minLength: 3',
            '        status:',
            '          type: string',
            '          pattern: "^(queued|done)$"',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              type: object',
            '              properties:',
            '                email:',
            "                  $ref: '#/components/schemas/SharedFields/properties/email'",
            '      responses:',
            "        '200':",
            '          description: ok',
            '          content:',
            '            application/json:',
            '              schema:',
            '                type: object',
            '                properties:',
            '                  status:',
            "                    $ref: '#/components/schemas/SharedFields/properties/status'",
          ].join('\n'),
          current: [
            'openapi: 3.0.3',
            'components:',
            '  schemas:',
            '    SharedFields:',
            '      type: object',
            '      properties:',
            '        email:',
            '          type: string',
            '          minLength: 8',
            '          format: email',
            '        status:',
            '          type: string',
            'paths:',
            '  /users:',
            '    post:',
            '      requestBody:',
            '        required: true',
            '        content:',
            '          application/json:',
            '            schema:',
            '              type: object',
            '              properties:',
            '                email:',
            "                  $ref: '#/components/schemas/SharedFields/properties/email'",
            '      responses:',
            "        '200':",
            '          description: ok',
            '          content:',
            '            application/json:',
            '              schema:',
            '                type: object',
            '                properties:',
            '                  status:',
            "                    $ref: '#/components/schemas/SharedFields/properties/status'",
          ].join('\n'),
        },
      ],
    });

    expect(parsed.contractArtifacts.map((item) => item.ruleId)).toEqual([
      'contract/openapi-breaking-request-validation-tighten',
      'contract/openapi-breaking-response-validation-weaken',
    ]);
    expect(parsed.contractArtifacts[0].excerpt).toContain('request.email');
    expect(parsed.contractArtifacts[1].excerpt).toContain('response[200].status');
  });

  it('should dedupe native findings against passthrough artifacts and keep the later artifact payload', () => {
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
      contractArtifacts: [
        {
          source: 'contract-baseline',
          ruleId: 'contract/openapi-operation-id',
          severity: 'warning',
          message: 'OpenAPI operation POST /users is missing operationId',
          file: '/tmp/openapi.yaml',
          language: 'contract',
          line: 1,
          column: 0,
          excerpt: 'POST /users',
          governanceDomain: ['backend', 'interface'],
          impactHint: 'medium',
        },
      ],
    });

    expect(parsed.contractArtifacts.map((item) => item.ruleId)).toEqual([
      'contract/openapi-operation-id',
      'contract/openapi-auth-required',
      'contract/openapi-success-response',
    ]);
    expect(parsed.contractArtifacts[0].source).toBe('contract-baseline');
  });

  it('should keep near-duplicate artifacts when their finding payload differs', () => {
    const parsed = parseArtifactInputs({
      contractArtifacts: [
        {
          source: 'artifact-a',
          ruleId: 'contract/openapi-operation-id',
          severity: 'warning',
          message: 'OpenAPI operation POST /users is missing operationId',
          file: '/tmp/openapi.yaml',
          language: 'contract',
          line: 1,
          column: 0,
          excerpt: 'POST /users',
          governanceDomain: ['backend', 'interface'],
          impactHint: 'medium',
        },
        {
          source: 'artifact-b',
          ruleId: 'contract/openapi-operation-id',
          severity: 'warning',
          message: 'OpenAPI operation POST /users is missing stable operationId',
          file: '/tmp/openapi.yaml',
          language: 'contract',
          line: 1,
          column: 0,
          excerpt: 'POST /users',
          governanceDomain: ['backend', 'interface'],
          impactHint: 'medium',
        },
      ],
    });

    expect(parsed.contractArtifacts).toHaveLength(2);
    expect(parsed.contractArtifacts.map((item) => item.source)).toEqual([
      'artifact-a',
      'artifact-b',
    ]);
  });
});
