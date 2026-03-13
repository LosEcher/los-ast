import { artifactParserProfiles } from './registry.js';
function toArtifactDedupKey(artifact, fallbackFile) {
    return JSON.stringify({
        ruleId: artifact.ruleId || '',
        message: artifact.message || 'Contract finding',
        file: artifact.file || artifact.source || fallbackFile,
    });
}
function dedupeArtifacts(artifacts, fallbackFile) {
    const deduped = new Map();
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
