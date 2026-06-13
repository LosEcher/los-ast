/**
 * Schema Artifacts - Parser
 * SQL and Prisma schema parsing
 */
import { ValidationError } from '../../../types/errors.js';
import { cleanSqlIdentifier, normalizeType, normalizeSqlType, isSequenceBackedSqlType, normalizeDefaultValue } from './normalizer.js';
export function inferFormat(document) {
    if (document.format === 'sql' || document.format === 'prisma') {
        return document.format;
    }
    const trimmed = document.content.trim();
    if (/^model\s+\w+\s*\{/m.test(trimmed)) {
        return 'prisma';
    }
    if (/create\s+table/i.test(trimmed)) {
        return 'sql';
    }
    throw new ValidationError('INVALID_SCHEMA_DOCUMENT', `Unable to infer schema document format: ${document.source || document.file || 'schema-document'}`);
}
// SQL parsing utilities
function extractSqlTypeToken(definition) {
    const trimmed = definition.trim();
    if (/^enum\s*\(/i.test(trimmed)) {
        const match = trimmed.match(/^(enum\s*\([^)]*\))/i);
        return match ? match[1] : undefined;
    }
    const compoundMatch = trimmed.match(/^(timestamp(?:\([^)]*\))?\s+(?:with|without)\s+time\s+zone|time(?:\([^)]*\))?\s+(?:with|without)\s+time\s+zone|double\s+precision|character\s+varying(?:\([^)]*\))?|char\s+varying(?:\([^)]*\))?|character(?:\([^)]*\))?)/i);
    if (compoundMatch) {
        return compoundMatch[1];
    }
    const match = trimmed.match(/^([A-Za-z0-9_]+(?:\([^)]*\))?)/);
    return match ? match[1] : undefined;
}
function parseSqlEnumValues(typeToken) {
    if (!typeToken || !/^enum\s*\(/i.test(typeToken)) {
        return undefined;
    }
    const inner = typeToken.replace(/^enum\s*\(|\)$/gi, '');
    const values = inner
        .split(',')
        .map((item) => item.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    return values.length > 0 ? values : undefined;
}
function extractSqlDefaultValue(definition) {
    const match = definition.match(/\bdefault\s+(.+?)(?:\s+(?:not null|null|primary key|unique|references)\b|$)/i);
    return normalizeDefaultValue(match?.[1]);
}
// Prisma parsing utilities
function parsePrismaEnums(content) {
    const enums = new Map();
    const enumRegex = /enum\s+(\w+)\s*\{([\s\S]*?)\}/g;
    let match;
    while ((match = enumRegex.exec(content)) !== null) {
        const values = match[2]
            .split('\n')
            .map((item) => item.trim())
            .filter(Boolean)
            .filter((item) => !item.startsWith('//'))
            .map((item) => item.split(/\s+/)[0])
            .filter(Boolean);
        enums.set(match[1], values);
    }
    return enums;
}
function extractPrismaDefaultValue(rawLine) {
    const match = rawLine.match(/@default\s*\((.+)\)/);
    return normalizeDefaultValue(match?.[1]);
}
// Main parsers
export function parseSqlEntities(content) {
    const entities = [];
    const tableRegex = /create\s+table\s+([^\s(]+)\s*\(([\s\S]*?)\);/gi;
    let match;
    while ((match = tableRegex.exec(content)) !== null) {
        const tableName = cleanSqlIdentifier(match[1]);
        const block = match[2];
        const rawLines = block
            .split('\n')
            .map((item) => item.trim())
            .filter(Boolean);
        const fields = new Map();
        const tablePrimaryKeys = new Set();
        const tableUniqueKeys = [];
        for (const [rawIndex, rawLine] of rawLines.entries()) {
            const normalizedLine = rawLine.replace(/,$/, '');
            const lowerLine = normalizedLine.toLowerCase();
            const primaryKeyMatch = lowerLine.match(/^primary key\s*\((.+)\)$/i);
            if (primaryKeyMatch) {
                for (const key of primaryKeyMatch[1].split(',').map((item) => cleanSqlIdentifier(item.trim()))) {
                    tablePrimaryKeys.add(key);
                }
                continue;
            }
            const uniqueMatch = lowerLine.match(/^unique\s*\((.+)\)$/i);
            if (uniqueMatch) {
                tableUniqueKeys.push(uniqueMatch[1].split(',').map((item) => cleanSqlIdentifier(item.trim())).filter(Boolean));
                continue;
            }
            const columnMatch = normalizedLine.match(/^([`"\[\]\w]+)\s+(.+)$/);
            if (!columnMatch) {
                continue;
            }
            const fieldName = cleanSqlIdentifier(columnMatch[1]);
            const definition = columnMatch[2];
            const typeToken = extractSqlTypeToken(definition);
            if (!typeToken) {
                continue;
            }
            fields.set(fieldName, {
                type: normalizeSqlType(typeToken),
                nullable: !/\bnot\s+null\b/i.test(lowerLine) && !/\bprimary\s+key\b/i.test(lowerLine),
                hasDefault: /\bdefault\b/i.test(lowerLine) || isSequenceBackedSqlType(typeToken),
                defaultValue: extractSqlDefaultValue(definition) || (isSequenceBackedSqlType(typeToken) ? '@generated_increment' : undefined),
                primaryKey: /\bprimary\s+key\b/i.test(lowerLine),
                unique: /\bunique\b/i.test(lowerLine) && !/\bprimary\s+key\b/i.test(lowerLine),
                enumValues: parseSqlEnumValues(typeToken),
                line: content.slice(0, match.index).split('\n').length + rawIndex + 1,
                excerpt: normalizedLine,
            });
        }
        for (const primaryKeyField of tablePrimaryKeys) {
            const field = fields.get(primaryKeyField);
            if (field) {
                field.primaryKey = true;
            }
        }
        entities.push({ name: tableName, fields, uniqueKeys: tableUniqueKeys });
    }
    return entities;
}
export function parsePrismaEntities(content) {
    const entities = [];
    const enums = parsePrismaEnums(content);
    const modelRegex = /model\s+(\w+)\s*\{([\s\S]*?)\}/g;
    let match;
    while ((match = modelRegex.exec(content)) !== null) {
        const modelName = match[1];
        const block = match[2];
        const rawLines = block
            .split('\n')
            .map((item) => item.trim())
            .filter(Boolean)
            .filter((item) => !item.startsWith('//'));
        const fields = new Map();
        const compositePrimaryKeys = new Set();
        const compositeUniqueKeys = [];
        for (const [rawIndex, rawLine] of rawLines.entries()) {
            const compositeIdMatch = rawLine.match(/^@@id\s*\(\s*\[([^\]]+)\]/);
            if (compositeIdMatch) {
                for (const key of compositeIdMatch[1].split(',').map((item) => item.trim()).filter(Boolean)) {
                    compositePrimaryKeys.add(key);
                }
                continue;
            }
            const compositeUniqueMatch = rawLine.match(/^@@unique\s*\(\s*\[([^\]]+)\]/);
            if (compositeUniqueMatch) {
                compositeUniqueKeys.push(compositeUniqueMatch[1].split(',').map((item) => item.trim()).filter(Boolean));
                continue;
            }
            const fieldMatch = rawLine.match(/^(\w+)\s+([A-Za-z][A-Za-z0-9]*\??)/);
            if (!fieldMatch) {
                continue;
            }
            const typeToken = fieldMatch[2];
            const normalizedType = typeToken.replace(/\?$/, '');
            fields.set(fieldMatch[1], {
                type: normalizeType(normalizedType),
                nullable: typeToken.endsWith('?'),
                hasDefault: /@default\s*\(/.test(rawLine) || /@updatedAt\b/.test(rawLine),
                defaultValue: extractPrismaDefaultValue(rawLine) || (/@updatedAt\b/.test(rawLine) ? '@updatedat' : undefined),
                primaryKey: /@id\b/.test(rawLine),
                unique: /@unique\b/.test(rawLine),
                enumValues: enums.get(normalizedType),
                line: content.slice(0, match.index).split('\n').length + rawIndex + 1,
                excerpt: rawLine,
            });
        }
        for (const primaryKeyField of compositePrimaryKeys) {
            const field = fields.get(primaryKeyField);
            if (field) {
                field.primaryKey = true;
            }
        }
        entities.push({ name: modelName, fields, uniqueKeys: compositeUniqueKeys });
    }
    return entities;
}
