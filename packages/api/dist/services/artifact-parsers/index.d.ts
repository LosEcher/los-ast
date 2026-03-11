import type { ContractArtifactFindingInput, OpenApiComparisonInput, OpenApiDocumentInput, SchemaArtifactFindingInput, SchemaComparisonInput, SchemaDocumentInput } from '@los-ast/shared/types';
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
export declare function parseArtifactInputs(input: ArtifactParserInput): ParsedArtifactInputs;
//# sourceMappingURL=index.d.ts.map