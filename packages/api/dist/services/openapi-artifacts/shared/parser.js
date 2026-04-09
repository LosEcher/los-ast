/**
 * OpenAPI Artifacts - Parser
 * Extracted from shared.ts for better modularity
 */
import { parse as parseYaml } from 'yaml';
import { ValidationError } from '../../../types/errors.js';
import { isRecord, parseOperationLabel } from './utils.js';
import { matchesStructuredKey, getLeadingSpaceCount } from './utils.js';
export function parseDocument(document, index) {
    const sourceLabel = document.source || document.file || `openapi-${index + 1}`;
    try {
        if (document.format === 'json') {
            return JSON.parse(document.content);
        }
        if (document.format === 'yaml') {
            return parseYaml(document.content);
        }
        const trimmed = document.content.trim();
        if (trimmed.startsWith('{')) {
            return JSON.parse(trimmed);
        }
        return parseYaml(document.content);
    }
    catch (error) {
        throw new ValidationError('INVALID_OPENAPI_DOCUMENT', `Failed to parse OpenAPI document: ${sourceLabel}`, {
            source: sourceLabel,
            reason: error instanceof Error ? error.message : String(error),
        });
    }
}
export function ensureOpenApiShape(document, sourceLabel) {
    if (!document.openapi || typeof document.openapi !== 'string' || !isRecord(document.paths)) {
        throw new ValidationError('INVALID_OPENAPI_DOCUMENT', `OpenAPI document is missing required fields: ${sourceLabel}`, {
            source: sourceLabel,
            required: ['openapi', 'paths'],
        });
    }
}
function findYamlOperationLine(content, routePath, method) {
    const lines = content.split(/\r?\n/u);
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !matchesStructuredKey(trimmed, routePath)) {
            continue;
        }
        const pathIndent = getLeadingSpaceCount(line);
        const pathLine = index + 1;
        for (let childIndex = index + 1; childIndex < lines.length; childIndex += 1) {
            const childLine = lines[childIndex];
            const childTrimmed = childLine.trim();
            if (!childTrimmed || childTrimmed.startsWith('#')) {
                continue;
            }
            const childIndent = getLeadingSpaceCount(childLine);
            if (childIndent <= pathIndent) {
                break;
            }
            if (childIndent === pathIndent + 2 && matchesStructuredKey(childTrimmed, method)) {
                return childIndex + 1;
            }
        }
        return pathLine;
    }
    return undefined;
}
function findJsonOperationLine(content, routePath, method) {
    const lines = content.split(/\r?\n/u);
    let pathLine;
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (!pathLine && line.includes(`"${routePath}"`)) {
            pathLine = index + 1;
            continue;
        }
        if (pathLine && line.includes(`"${method}"`)) {
            return index + 1;
        }
    }
    return pathLine;
}
export function resolveOperationLine(document, operationLabel) {
    const parsedLabel = parseOperationLabel(operationLabel);
    if (!parsedLabel) {
        return 1;
    }
    const format = document.format || (document.content.trim().startsWith('{') ? 'json' : 'yaml');
    const line = format === 'json'
        ? findJsonOperationLine(document.content, parsedLabel.routePath, parsedLabel.method)
        : findYamlOperationLine(document.content, parsedLabel.routePath, parsedLabel.method);
    return line || 1;
}
