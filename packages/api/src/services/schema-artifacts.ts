import type {
  SchemaArtifactFindingInput,
  SchemaComparisonInput,
  SchemaDocumentInput,
} from '@los-ast/shared/types';
import {
  inferFormat,
  parsePrismaEntities,
  parseSqlEntities,
  type SchemaEntity,
  type SchemaField,
} from './schema-artifacts/shared.js';

const SENSITIVE_FIELD_RE = /(email|phone|mobile|token|secret|password)/i;
const LIFECYCLE_FIELD_RE = /^(status|state)$/i;
const AUDIT_TIMESTAMP_RE = /^(created_at|updated_at|createdAt|updatedAt)$/i;

function buildSqlArtifacts(document: SchemaDocumentInput, sourceLabel: string, fileLabel: string): SchemaArtifactFindingInput[] {
  const artifacts: SchemaArtifactFindingInput[] = [];
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
      const firstField = entity.fields.values().next().value as SchemaField | undefined;
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

function buildPrismaArtifacts(document: SchemaDocumentInput, sourceLabel: string, fileLabel: string): SchemaArtifactFindingInput[] {
  const artifacts: SchemaArtifactFindingInput[] = [];
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
      const firstField = entity.fields.values().next().value as SchemaField | undefined;
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

export function buildSchemaArtifactsFromDocuments(
  documents: SchemaDocumentInput[] | undefined
): SchemaArtifactFindingInput[] {
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

function buildBreakingFinding(
  sourceLabel: string,
  fileLabel: string,
  line: number,
  ruleId: string,
  message: string,
  excerpt: string
): SchemaArtifactFindingInput {
  return buildComparisonFinding(sourceLabel, fileLabel, line, ruleId, 'error', message, excerpt, 'high');
}

function buildComparisonFinding(
  sourceLabel: string,
  fileLabel: string,
  line: number,
  ruleId: string,
  severity: 'info' | 'warning' | 'error',
  message: string,
  excerpt: string,
  impactHint: 'low' | 'medium' | 'high'
): SchemaArtifactFindingInput {
  return {
    source: sourceLabel,
    ruleId,
    severity,
    message,
    file: fileLabel,
    language: 'schema',
    line,
    column: 0,
    excerpt,
    governanceDomain: ['database', 'interface'],
    impactHint,
  };
}

function diffEnumValues(
  baselineValues: string[] | undefined,
  currentValues: string[] | undefined
): { removed: string[]; added: string[] } {
  const baselineSet = new Set(baselineValues || []);
  const currentSet = new Set(currentValues || []);

  return {
    removed: Array.from(baselineSet).filter((value) => !currentSet.has(value)),
    added: Array.from(currentSet).filter((value) => !baselineSet.has(value)),
  };
}

function normalizeUniqueKey(key: string[]): string {
  return [...key].sort().join('|');
}

function compareEntities(
  sourceLabel: string,
  fileLabel: string,
  prefix: 'sql' | 'prisma',
  baselineEntities: SchemaEntity[],
  currentEntities: SchemaEntity[]
): SchemaArtifactFindingInput[] {
  const artifacts: SchemaArtifactFindingInput[] = [];
  const currentByName = new Map(currentEntities.map((entity) => [entity.name, entity]));
  let line = 1;

  for (const baselineEntity of baselineEntities) {
    const currentEntity = currentByName.get(baselineEntity.name);
    if (!currentEntity) {
      artifacts.push(buildBreakingFinding(
        sourceLabel,
        fileLabel,
        line,
        `schema/${prefix}-breaking-drop-entity`,
        `${prefix === 'sql' ? 'Table' : 'Model'} ${baselineEntity.name} was removed in current schema`,
        baselineEntity.name,
      ));
      line += 1;
      continue;
    }

    const baselinePrimaryKeys = Array.from(baselineEntity.fields.entries())
      .filter(([, field]) => field.primaryKey)
      .map(([fieldName]) => fieldName)
      .sort();
    const currentPrimaryKeys = Array.from(currentEntity.fields.entries())
      .filter(([, field]) => field.primaryKey)
      .map(([fieldName]) => fieldName)
      .sort();

    if (baselinePrimaryKeys.join('|') !== currentPrimaryKeys.join('|')) {
      const baselineLabel = baselinePrimaryKeys.length > 0 ? baselinePrimaryKeys.join(', ') : 'none';
      const currentLabel = currentPrimaryKeys.length > 0 ? currentPrimaryKeys.join(', ') : 'none';
      artifacts.push(buildBreakingFinding(
        sourceLabel,
        fileLabel,
        line,
        `schema/${prefix}-breaking-primary-key-change`,
        `${prefix === 'sql' ? 'Table' : 'Model'} ${baselineEntity.name} changed primary key from ${baselineLabel} to ${currentLabel}`,
        `${baselineEntity.name}: primary key ${baselineLabel} -> ${currentLabel}`,
      ));
    }

    const baselineUniqueKeys = (baselineEntity.uniqueKeys || []).map(normalizeUniqueKey).sort();
    const currentUniqueKeys = (currentEntity.uniqueKeys || []).map(normalizeUniqueKey).sort();

    for (const key of baselineUniqueKeys.filter((item) => !currentUniqueKeys.includes(item))) {
      artifacts.push(buildComparisonFinding(
        sourceLabel,
        fileLabel,
        line,
        `schema/${prefix}-composite-unique-removed`,
        'info',
        `${prefix === 'sql' ? 'Table' : 'Model'} ${baselineEntity.name} removed unique constraint on [${key.replace(/\|/g, ', ')}]`,
        `${baselineEntity.name}: unique [${key.replace(/\|/g, ', ')}] removed`,
        'low',
      ));
    }

    for (const key of currentUniqueKeys.filter((item) => !baselineUniqueKeys.includes(item))) {
      artifacts.push(buildComparisonFinding(
        sourceLabel,
        fileLabel,
        line,
        `schema/${prefix}-composite-unique-added`,
        'warning',
        `${prefix === 'sql' ? 'Table' : 'Model'} ${baselineEntity.name} added unique constraint on [${key.replace(/\|/g, ', ')}]`,
        `${baselineEntity.name}: unique [${key.replace(/\|/g, ', ')}] added`,
        'medium',
      ));
    }

    for (const [fieldName, baselineField] of baselineEntity.fields.entries()) {
      const currentField = currentEntity.fields.get(fieldName);
      if (!currentField) {
        artifacts.push(buildBreakingFinding(
          sourceLabel,
          fileLabel,
          line,
          `schema/${prefix}-breaking-drop-field`,
          `Field ${baselineEntity.name}.${fieldName} was removed in current schema`,
          `${baselineEntity.name}.${fieldName}`,
        ));
        line += 1;
        continue;
      }

      const nullabilityTightenedWithDefault = baselineField.nullable && !currentField.nullable && currentField.hasDefault;

      if (baselineField.type !== currentField.type) {
        artifacts.push(buildBreakingFinding(
          sourceLabel,
          fileLabel,
          line,
          `schema/${prefix}-breaking-type-change`,
          `Field ${baselineEntity.name}.${fieldName} changed type from ${baselineField.type} to ${currentField.type}`,
          `${baselineEntity.name}.${fieldName}: ${baselineField.type} -> ${currentField.type}`,
        ));
      }

      if (baselineField.nullable && !currentField.nullable) {
        if (!currentField.hasDefault) {
          artifacts.push(buildBreakingFinding(
            sourceLabel,
            fileLabel,
            line,
            `schema/${prefix}-breaking-nullability-tighten`,
            `Field ${baselineEntity.name}.${fieldName} changed from nullable to required without default`,
            `${baselineEntity.name}.${fieldName}`,
          ));
        } else {
          artifacts.push(buildComparisonFinding(
            sourceLabel,
            fileLabel,
            line,
            `schema/${prefix}-nullability-tighten-with-default`,
            'warning',
            `Field ${baselineEntity.name}.${fieldName} changed from nullable to required with default ${currentField.defaultValue || ''}`.trim(),
            `${baselineEntity.name}.${fieldName}: nullable -> required with default`,
            'medium',
          ));
        }
      }

      if (baselineField.unique && !currentField.unique) {
        artifacts.push(buildComparisonFinding(
          sourceLabel,
          fileLabel,
          line,
          `schema/${prefix}-unique-removed`,
          'info',
          `Field ${baselineEntity.name}.${fieldName} removed unique constraint`,
          `${baselineEntity.name}.${fieldName}: unique removed`,
          'low',
        ));
      } else if (!baselineField.unique && currentField.unique) {
        artifacts.push(buildComparisonFinding(
          sourceLabel,
          fileLabel,
          line,
          `schema/${prefix}-unique-added`,
          'warning',
          `Field ${baselineEntity.name}.${fieldName} added unique constraint`,
          `${baselineEntity.name}.${fieldName}: unique added`,
          'medium',
        ));
      }

      const enumDiff = diffEnumValues(baselineField.enumValues, currentField.enumValues);
      if (enumDiff.removed.length > 0) {
        artifacts.push(buildBreakingFinding(
          sourceLabel,
          fileLabel,
          line,
          `schema/${prefix}-breaking-enum-value-drop`,
          `Field ${baselineEntity.name}.${fieldName} removed enum values: ${enumDiff.removed.join(', ')}`,
          `${baselineEntity.name}.${fieldName}: -${enumDiff.removed.join(', -')}`,
        ));
      }

      if (enumDiff.added.length > 0) {
        artifacts.push(buildComparisonFinding(
          sourceLabel,
          fileLabel,
          line,
          `schema/${prefix}-enum-value-add`,
          'info',
          `Field ${baselineEntity.name}.${fieldName} added enum values: ${enumDiff.added.join(', ')}`,
          `${baselineEntity.name}.${fieldName}: +${enumDiff.added.join(', +')}`,
          'low',
        ));
      }

      if (baselineField.hasDefault && !currentField.hasDefault) {
        artifacts.push(buildComparisonFinding(
          sourceLabel,
          fileLabel,
          line,
          `schema/${prefix}-default-removed`,
          'warning',
          `Field ${baselineEntity.name}.${fieldName} removed default value ${baselineField.defaultValue || ''}`.trim(),
          `${baselineEntity.name}.${fieldName}: default removed`,
          'medium',
        ));
      } else if (!baselineField.hasDefault && currentField.hasDefault && !nullabilityTightenedWithDefault) {
        artifacts.push(buildComparisonFinding(
          sourceLabel,
          fileLabel,
          line,
          `schema/${prefix}-default-added`,
          'info',
          `Field ${baselineEntity.name}.${fieldName} added default value ${currentField.defaultValue || ''}`.trim(),
          `${baselineEntity.name}.${fieldName}: default added`,
          'low',
        ));
      } else if (
        baselineField.hasDefault &&
        currentField.hasDefault &&
        baselineField.defaultValue &&
        currentField.defaultValue &&
        baselineField.defaultValue !== currentField.defaultValue
      ) {
        artifacts.push(buildComparisonFinding(
          sourceLabel,
          fileLabel,
          line,
          `schema/${prefix}-default-changed`,
          'warning',
          `Field ${baselineEntity.name}.${fieldName} changed default value from ${baselineField.defaultValue} to ${currentField.defaultValue}`,
          `${baselineEntity.name}.${fieldName}: ${baselineField.defaultValue} -> ${currentField.defaultValue}`,
          'medium',
        ));
      }

      line += 1;
    }

    for (const [fieldName, currentField] of currentEntity.fields.entries()) {
      if (baselineEntity.fields.has(fieldName)) {
        continue;
      }

      if (!currentField.nullable && !currentField.hasDefault) {
        artifacts.push(buildBreakingFinding(
          sourceLabel,
          fileLabel,
          line,
          `schema/${prefix}-breaking-add-required-field`,
          `Field ${baselineEntity.name}.${fieldName} was added as required without default`,
          `${baselineEntity.name}.${fieldName}`,
        ));
      } else if (!currentField.nullable && currentField.hasDefault) {
        artifacts.push(buildComparisonFinding(
          sourceLabel,
          fileLabel,
          line,
          `schema/${prefix}-add-required-field-with-default`,
          'warning',
          `Field ${baselineEntity.name}.${fieldName} was added as required with default ${currentField.defaultValue || ''}`.trim(),
          `${baselineEntity.name}.${fieldName}: required with default`,
          'medium',
        ));
      }

      line += 1;
    }
  }

  return artifacts;
}

export function buildSchemaArtifactsFromComparisons(
  comparisons: SchemaComparisonInput[] | undefined
): SchemaArtifactFindingInput[] {
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
      return compareEntities(
        sourceLabel,
        fileLabel,
        'sql',
        parseSqlEntities(comparison.baseline),
        parseSqlEntities(comparison.current),
      );
    }

    return compareEntities(
      sourceLabel,
      fileLabel,
      'prisma',
      parsePrismaEntities(comparison.baseline),
      parsePrismaEntities(comparison.current),
    );
  });
}
