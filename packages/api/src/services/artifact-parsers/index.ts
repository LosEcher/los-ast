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

function normalizeArtifactRange(artifact: ArtifactInput) {
  if (artifact.range?.start && artifact.range.end) {
    return artifact.range;
  }

  const line = typeof artifact.line === 'number' && Number.isFinite(artifact.line)
    ? Math.max(1, Math.floor(artifact.line))
    : 1;
  const column = typeof artifact.column === 'number' && Number.isFinite(artifact.column)
    ? Math.max(0, Math.floor(artifact.column))
    : 0;
  const startIndex = typeof artifact.startIndex === 'number' && Number.isFinite(artifact.startIndex)
    ? Math.max(0, Math.floor(artifact.startIndex))
    : 0;
  const endIndex = typeof artifact.endIndex === 'number' && Number.isFinite(artifact.endIndex)
    ? Math.max(startIndex, Math.floor(artifact.endIndex))
    : startIndex + 1;

  return {
    start: { line, column, index: startIndex },
    end: { line, column: Math.max(column + 1, column), index: endIndex },
  };
}

function toArtifactDedupKey(
  artifact: ArtifactInput,
  fallbackFile: string
): string {
  return JSON.stringify({
    ruleId: artifact.ruleId || '',
    message: artifact.message || 'Contract finding',
    file: artifact.file || artifact.source || fallbackFile,
    range: normalizeArtifactRange(artifact),
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
