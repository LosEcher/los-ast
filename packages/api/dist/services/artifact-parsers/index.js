import { artifactParserProfiles } from './registry.js';
function normalizeArtifactRange(artifact) {
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
function toArtifactDedupKey(artifact, fallbackFile) {
    return JSON.stringify({
        ruleId: artifact.ruleId || '',
        message: artifact.message || 'Contract finding',
        file: artifact.file || artifact.source || fallbackFile,
        range: normalizeArtifactRange(artifact),
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
//# sourceMappingURL=index.js.map