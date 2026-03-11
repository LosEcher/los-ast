import { artifactParserProfiles } from './registry.js';
export function parseArtifactInputs(input) {
    const parsed = {
        contractArtifacts: [],
        schemaArtifacts: [],
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
            parsed.contractArtifacts.push(...findings);
            continue;
        }
        parsed.schemaArtifacts.push(...findings);
    }
    return {
        contractArtifacts: [...parsed.contractArtifacts, ...(input.contractArtifacts || [])],
        schemaArtifacts: [...parsed.schemaArtifacts, ...(input.schemaArtifacts || [])],
    };
}
//# sourceMappingURL=index.js.map