import type {
  ContractArtifactFindingInput,
  OpenApiDocumentInput,
  SchemaArtifactFindingInput,
  SchemaDocumentInput,
} from '@los-ast/shared/types';
import { artifactParserProfiles } from './registry.js';

export interface ArtifactParserRuntimeConfig {
  enableOpenApiNativeParser?: boolean;
  enableSchemaNativeParser?: boolean;
}

export interface ArtifactParserInput {
  openApiDocuments?: OpenApiDocumentInput[];
  schemaDocuments?: SchemaDocumentInput[];
  contractArtifacts?: ContractArtifactFindingInput[];
  schemaArtifacts?: SchemaArtifactFindingInput[];
  runtimeConfig?: ArtifactParserRuntimeConfig;
}

export interface ParsedArtifactInputs {
  contractArtifacts: ContractArtifactFindingInput[];
  schemaArtifacts: SchemaArtifactFindingInput[];
}

export function parseArtifactInputs(input: ArtifactParserInput): ParsedArtifactInputs {
  const parsed = {
    contractArtifacts: [] as ContractArtifactFindingInput[],
    schemaArtifacts: [] as SchemaArtifactFindingInput[],
  };

  for (const profile of artifactParserProfiles) {
    if (profile.id === 'openapi-native' && input.runtimeConfig?.enableOpenApiNativeParser === false) {
      continue;
    }

    if (profile.id === 'schema-native' && input.runtimeConfig?.enableSchemaNativeParser === false) {
      continue;
    }

    const findings = profile.parse({
      openApiDocuments: input.openApiDocuments,
      schemaDocuments: input.schemaDocuments,
    });

    if (profile.source === 'contract') {
      parsed.contractArtifacts.push(...(findings as ContractArtifactFindingInput[]));
      continue;
    }

    parsed.schemaArtifacts.push(...(findings as SchemaArtifactFindingInput[]));
  }

  return {
    contractArtifacts: [...parsed.contractArtifacts, ...(input.contractArtifacts || [])],
    schemaArtifacts: [...parsed.schemaArtifacts, ...(input.schemaArtifacts || [])],
  };
}
