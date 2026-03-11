import type {
  ContractArtifactFindingInput,
  OpenApiComparisonInput,
  OpenApiDocumentInput,
  SchemaArtifactFindingInput,
  SchemaComparisonInput,
  SchemaDocumentInput,
} from '@los-ast/shared/types';
import { buildContractArtifactsFromOpenApi, buildContractArtifactsFromOpenApiComparisons } from '../openapi-artifacts.js';
import { buildSchemaArtifactsFromComparisons, buildSchemaArtifactsFromDocuments } from '../schema-artifacts.js';

export interface ArtifactParserContext {
  openApiDocuments?: OpenApiDocumentInput[];
  openApiComparisons?: OpenApiComparisonInput[];
  schemaDocuments?: SchemaDocumentInput[];
  schemaComparisons?: SchemaComparisonInput[];
}

export interface ArtifactParserCapabilities {
  version: string;
  stability: 'experimental' | 'preview' | 'stable';
  acceptedFormats: string[];
  emitsFindingSource: 'contract' | 'schema';
  checks: string[];
  limitations: string[];
  fixtureFiles: string[];
}

export interface ArtifactParserProfile {
  id: string;
  source: 'contract' | 'schema';
  capabilities: ArtifactParserCapabilities;
  parse(context: ArtifactParserContext): ContractArtifactFindingInput[] | SchemaArtifactFindingInput[];
}

export const artifactParserProfiles: ArtifactParserProfile[] = [
  {
    id: 'openapi-native',
    source: 'contract',
    capabilities: {
      version: '0.1.0',
      stability: 'preview',
      acceptedFormats: ['yaml', 'json'],
      emitsFindingSource: 'contract',
      checks: [
        'missing operationId',
        'missing security on mutating operations',
        'missing success response',
        'breaking request required-field add',
        'breaking response field drop',
        'breaking response field type change',
      ],
      limitations: [
        'heuristic line mapping only',
        'does not resolve remote refs',
        'comparison requires caller-provided baseline/current pair',
        'comparison only inspects top-level application/json schemas',
      ],
      fixtureFiles: [
        'fixtures/artifact-parsers/openapi-minimal.yaml',
        'fixtures/artifact-parsers/openapi-compare-baseline.yaml',
        'fixtures/artifact-parsers/openapi-compare-current.yaml',
      ],
    },
    parse(context) {
      return [
        ...buildContractArtifactsFromOpenApi(context.openApiDocuments),
        ...buildContractArtifactsFromOpenApiComparisons(context.openApiComparisons),
      ];
    },
  },
  {
    id: 'schema-native',
    source: 'schema',
    capabilities: {
      version: '0.1.0',
      stability: 'preview',
      acceptedFormats: ['sql', 'prisma'],
      emitsFindingSource: 'schema',
      checks: [
        'missing primary key',
        'nullable sensitive field',
        'missing lifecycle default',
        'missing audit timestamp default',
        'breaking field drop',
        'breaking type change',
        'breaking nullability tighten',
        'breaking enum value drop',
        'default compatibility drift',
      ],
      limitations: [
        'heuristic parsing only',
        'comparison requires caller-provided baseline/current pair',
        'enum parsing is limited to inline sql enum(...) and prisma enum blocks',
        'default compatibility does not yet model function-equivalence across dialects',
      ],
      fixtureFiles: [
        'fixtures/artifact-parsers/schema-minimal.sql',
        'fixtures/artifact-parsers/schema-minimal.prisma',
      ],
    },
    parse(context) {
      return [
        ...buildSchemaArtifactsFromDocuments(context.schemaDocuments),
        ...buildSchemaArtifactsFromComparisons(context.schemaComparisons),
      ];
    },
  },
];
