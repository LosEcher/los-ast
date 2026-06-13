import { inferFormat, parsePrismaEntities, parseSqlEntities, compareEntities, } from './schema-artifacts/shared.js';
const SENSITIVE_FIELD_RE = /(email|phone|mobile|token|secret|password)/i;
const LIFECYCLE_FIELD_RE = /^(status|state)$/i;
const AUDIT_TIMESTAMP_RE = /^(created_at|updated_at|createdAt|updatedAt)$/i;
function buildSqlArtifacts(document, sourceLabel, fileLabel) {
    const artifacts = [];
    const entities = parseSqlEntities(document.content);
    for (const entity of entities) {
        const hasPrimaryKey = Array.from(entity.fields.values()).some((field) => field.primaryKey);
        for (const [fieldName, field] of entity.fields.entries()) {
            if (SENSITIVE_FIELD_RE.test(fieldName) && field.nullable) {
                artifacts.push({
                    source: sourceLabel,
                    ruleId: 'schema/sql-sensitive-nullable',
                    severity: 'warning',
                    message: `Sensitive column ${entity.name}.${fieldName} should not be nullable`,
                    file: fileLabel,
                    language: 'schema',
                    line: field.line,
                    column: 0,
                    excerpt: field.excerpt,
                    governanceDomain: ['database'],
                    impactHint: 'medium',
                });
            }
            if (LIFECYCLE_FIELD_RE.test(fieldName) && !field.nullable && !field.hasDefault) {
                artifacts.push({
                    source: sourceLabel,
                    ruleId: 'schema/sql-lifecycle-default',
                    severity: 'warning',
                    message: `Lifecycle column ${entity.name}.${fieldName} should declare a default value`,
                    file: fileLabel,
                    language: 'schema',
                    line: field.line,
                    column: 0,
                    excerpt: field.excerpt,
                    governanceDomain: ['database', 'interface'],
                    impactHint: 'medium',
                });
            }
            if (AUDIT_TIMESTAMP_RE.test(fieldName) && /(timestamp|datetime)/i.test(field.type) && !field.hasDefault) {
                artifacts.push({
                    source: sourceLabel,
                    ruleId: 'schema/sql-audit-timestamp-default',
                    severity: 'info',
                    message: `Audit timestamp ${entity.name}.${fieldName} should declare a default value`,
                    file: fileLabel,
                    language: 'schema',
                    line: field.line,
                    column: 0,
                    excerpt: field.excerpt,
                    governanceDomain: ['database'],
                    impactHint: 'low',
                });
            }
        }
        if (!hasPrimaryKey) {
            const firstField = entity.fields.values().next().value;
            artifacts.push({
                source: sourceLabel,
                ruleId: 'schema/sql-primary-key',
                severity: 'error',
                message: `Table ${entity.name} should declare a primary key`,
                file: fileLabel,
                language: 'schema',
                line: firstField?.line || 1,
                column: 0,
                excerpt: `CREATE TABLE ${entity.name}`,
                governanceDomain: ['database'],
                impactHint: 'high',
            });
        }
    }
    return artifacts;
}
function buildPrismaArtifacts(document, sourceLabel, fileLabel) {
    const artifacts = [];
    const entities = parsePrismaEntities(document.content);
    for (const entity of entities) {
        const hasPrimaryKey = Array.from(entity.fields.values()).some((field) => field.primaryKey) || /@@id\b/.test(document.content);
        for (const [fieldName, field] of entity.fields.entries()) {
            const hasUpdatedAt = field.defaultValue === '@updatedat';
            if (SENSITIVE_FIELD_RE.test(fieldName) && field.nullable && !field.primaryKey) {
                artifacts.push({
                    source: sourceLabel,
                    ruleId: 'schema/prisma-sensitive-nullable',
                    severity: 'warning',
                    message: `Sensitive field ${entity.name}.${fieldName} should not be optional`,
                    file: fileLabel,
                    language: 'schema',
                    line: field.line,
                    column: 0,
                    excerpt: field.excerpt,
                    governanceDomain: ['database'],
                    impactHint: 'medium',
                });
            }
            if (LIFECYCLE_FIELD_RE.test(fieldName) && !field.nullable && !field.hasDefault) {
                artifacts.push({
                    source: sourceLabel,
                    ruleId: 'schema/prisma-lifecycle-default',
                    severity: 'warning',
                    message: `Lifecycle field ${entity.name}.${fieldName} should declare @default(...)`,
                    file: fileLabel,
                    language: 'schema',
                    line: field.line,
                    column: 0,
                    excerpt: field.excerpt,
                    governanceDomain: ['database', 'interface'],
                    impactHint: 'medium',
                });
            }
            if (AUDIT_TIMESTAMP_RE.test(fieldName) && field.type === 'datetime' && !field.hasDefault && !hasUpdatedAt) {
                artifacts.push({
                    source: sourceLabel,
                    ruleId: 'schema/prisma-audit-timestamp-default',
                    severity: 'info',
                    message: `Audit field ${entity.name}.${fieldName} should declare @default(now()) or @updatedAt`,
                    file: fileLabel,
                    language: 'schema',
                    line: field.line,
                    column: 0,
                    excerpt: field.excerpt,
                    governanceDomain: ['database'],
                    impactHint: 'low',
                });
            }
        }
        if (!hasPrimaryKey) {
            const firstField = entity.fields.values().next().value;
            artifacts.push({
                source: sourceLabel,
                ruleId: 'schema/prisma-primary-key',
                severity: 'error',
                message: `Model ${entity.name} should declare an id field or @@id`,
                file: fileLabel,
                language: 'schema',
                line: firstField?.line || 1,
                column: 0,
                excerpt: `model ${entity.name}`,
                governanceDomain: ['database'],
                impactHint: 'high',
            });
        }
    }
    return artifacts;
}
export function buildSchemaArtifactsFromDocuments(documents) {
    if (!Array.isArray(documents) || documents.length === 0) {
        return [];
    }
    return documents.flatMap((document, index) => {
        const sourceLabel = document.source || document.file || `schema-${index + 1}`;
        const fileLabel = document.file || sourceLabel;
        const format = inferFormat(document);
        if (format === 'sql') {
            return buildSqlArtifacts(document, sourceLabel, fileLabel);
        }
        return buildPrismaArtifacts(document, sourceLabel, fileLabel);
    });
}
export function buildSchemaArtifactsFromComparisons(comparisons) {
    if (!Array.isArray(comparisons) || comparisons.length === 0) {
        return [];
    }
    return comparisons.flatMap((comparison, index) => {
        const sourceLabel = comparison.source || comparison.file || `schema-comparison-${index + 1}`;
        const fileLabel = comparison.file || sourceLabel;
        const format = comparison.format
            ? comparison.format
            : inferFormat({ source: comparison.source, file: comparison.file, content: comparison.current, format: comparison.format });
        if (format === 'sql') {
            return compareEntities(sourceLabel, fileLabel, 'sql', parseSqlEntities(comparison.baseline), parseSqlEntities(comparison.current));
        }
        return compareEntities(sourceLabel, fileLabel, 'prisma', parsePrismaEntities(comparison.baseline), parsePrismaEntities(comparison.current));
    });
}
