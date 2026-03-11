import type { ContractArtifactFindingInput, OpenApiComparisonInput, OpenApiDocumentInput, SchemaArtifactFindingInput, SchemaComparisonInput, SchemaDocumentInput } from '@los-ast/shared/types';
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
export declare const artifactParserProfiles: ArtifactParserProfile[];
//# sourceMappingURL=registry.d.ts.map