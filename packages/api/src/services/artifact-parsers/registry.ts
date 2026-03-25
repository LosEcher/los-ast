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
      version: '0.2.0',
      stability: 'preview',
      acceptedFormats: ['yaml', 'json'],
      emitsFindingSource: 'contract',
      checks: [
        'missing operationId',
        'missing security on mutating operations',
        'missing success response',
        'breaking operation drop',
        'breaking success response status drop',
        'breaking request required-field add',
        'request required-field add with default downgrade',
        'breaking request nullable tighten',
        'breaking request validation tighten on common schema keywords',
        'breaking request enum value drop',
        'request default compatibility drift',
        'breaking response field drop',
        'breaking response field type change',
        'breaking response nullable tighten',
        'breaking response validation guarantee weaken on common schema keywords',
        'breaking response enum value drop',
        'response default compatibility drift',
        'discriminator property change',
        'discriminator mapping value drop',
        'nested object/array.items/additionalProperties path comparison',
      ],
      limitations: [
        'heuristic line mapping only',
        'does not resolve remote refs',
        'comparison requires caller-provided baseline/current pair',
        'comparison only inspects application/json schemas',
        'allOf support is merge-only and intentionally shallow',
        'oneOf/anyOf comparison is based on common comparable fields, not full union semantics',
        'discriminator comparison currently focuses on propertyName and mapping-key drift',
        'validation-keyword comparison currently focuses on common monotonic keywords such as length/range/pattern/format',
        'local refs support generic json-pointer traversal, but remote refs are still unresolved',
      ],
      fixtureFiles: [
        'fixtures/artifact-parsers/openapi-minimal.yaml',
        'fixtures/artifact-parsers/openapi-compare-baseline.yaml',
        'fixtures/artifact-parsers/openapi-compare-current.yaml',
        'fixtures/artifact-parsers/openapi-value-semantics-baseline.yaml',
        'fixtures/artifact-parsers/openapi-value-semantics-current.yaml',
        'fixtures/artifact-parsers/openapi-discriminator-baseline.yaml',
        'fixtures/artifact-parsers/openapi-discriminator-current.yaml',
        'fixtures/artifact-parsers/openapi-composed-baseline.yaml',
        'fixtures/artifact-parsers/openapi-composed-current.yaml',
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
      version: '0.2.0',
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
        'graded nullability tighten with default',
        'breaking enum value drop',
        'default compatibility drift',
        'common sql type synonym equivalence',
        'sequence-backed increment default equivalence',
        'postgres serial/bigserial alias equivalence',
        'postgres timestamptz/timetz alias equivalence',
        'postgres int8/float8 alias equivalence',
        'graded default compatibility drift',
        'graded conservative sql type widening',
      ],
      limitations: [
        'heuristic parsing only',
        'comparison requires caller-provided baseline/current pair',
        'enum parsing is limited to inline sql enum(...) and prisma enum blocks',
        'default compatibility does not yet model full function-equivalence across every dialect and provider-specific default',
        'type/default alias equivalence is intentionally limited to a small set of conservative sql and postgres-specific synonyms',
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
