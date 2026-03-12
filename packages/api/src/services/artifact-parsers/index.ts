import type {
  ContractArtifactFindingInput,
  OpenApiComparisonInput,
  OpenApiDocumentInput,
  SchemaArtifactFindingInput,
  SchemaComparisonInput,
  SchemaDocumentInput,
} from '@los-ast/shared/types';
import { artifactParserProfiles } from './registry.js';

export interface ArtifactParserRuntimeConfig {
  enableOpenApiNativeParser?: boolean;
  enableSchemaNativeParser?: boolean;
}

export interface ArtifactParserInput {
  openApiDocuments?: OpenApiDocumentInput[];
  openApiComparisons?: OpenApiComparisonInput[];
  schemaDocuments?: SchemaDocumentInput[];
  schemaComparisons?: SchemaComparisonInput[];
  contractArtifacts?: ContractArtifactFindingInput[];
  schemaArtifacts?: SchemaArtifactFindingInput[];
  runtimeConfig?: ArtifactParserRuntimeConfig;
}

export interface ParsedArtifactInputs {
  contractArtifacts: ContractArtifactFindingInput[];
  schemaArtifacts: SchemaArtifactFindingInput[];
}

type ArtifactInput = ContractArtifactFindingInput | SchemaArtifactFindingInput;

function toArtifactDedupKey(
  artifact: ArtifactInput,
  fallbackFile: string
): string {
  return JSON.stringify({
    ruleId: artifact.ruleId || '',
    message: artifact.message || 'Contract finding',
    file: artifact.file || artifact.source || fallbackFile,
  });
}

function dedupeArtifacts<T extends ArtifactInput>(artifacts: T[], fallbackFile: string): T[] {
  const deduped = new Map<string, T>();

  for (const artifact of artifacts) {
    const key = toArtifactDedupKey(artifact, fallbackFile);
    const existing = deduped.get(key);

    if (!existing) {
      deduped.set(key, artifact);
      continue;
    }

    deduped.set(key, {
      ...existing,
      ...artifact,
    });
  }

  return Array.from(deduped.values());
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
      openApiComparisons: input.openApiComparisons,
      schemaDocuments: input.schemaDocuments,
      schemaComparisons: input.schemaComparisons,
    });

    if (profile.source === 'contract') {
      parsed.contractArtifacts.push(...(findings as ContractArtifactFindingInput[]));
      continue;
    }

    parsed.schemaArtifacts.push(...(findings as SchemaArtifactFindingInput[]));
  }

  return {
    contractArtifacts: dedupeArtifacts([
      ...parsed.contractArtifacts,
      ...(input.contractArtifacts || []),
    ], 'contract'),
    schemaArtifacts: dedupeArtifacts([
      ...parsed.schemaArtifacts,
      ...(input.schemaArtifacts || []),
    ], 'schema'),
  };
}
