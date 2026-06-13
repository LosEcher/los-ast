import type { SchemaArtifactFindingInput } from '@los-ast/shared/types';
import type { SchemaEntity, SchemaField } from './types.js';

const LIFECYCLE_FIELD_RE = /^(status|state)$/i;
const AUDIT_TIMESTAMP_RE = /^(created_at|updated_at|createdAt|updatedAt)$/i;
export function buildBreakingFinding(
  sourceLabel: string,
  fileLabel: string,
  line: number,
  ruleId: string,
  message: string,
  excerpt: string
): SchemaArtifactFindingInput {
  return buildComparisonFinding(sourceLabel, fileLabel, line, ruleId, 'error', message, excerpt, 'high');
}

export function buildComparisonFinding(
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

export function diffEnumValues(
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

export function normalizeUniqueKey(key: string[]): string {
  return [...key].sort().join('|');
}

export function getSingleFieldUniqueKeys(entity: SchemaEntity): Set<string> {
  return new Set(
    (entity.uniqueKeys || [])
      .filter((key) => key.length === 1)
      .map((key) => key[0]),
  );
}

export function isGeneratedDefaultValue(value: string | undefined): boolean {
  return value === '@current_timestamp'
    || value === '@generated_uuid'
    || value === '@generated_increment'
    || value === '@updatedat';
}

export function isLowRiskDefaultRemoval(fieldName: string, field: SchemaField): boolean {
  return field.nullable
    && !field.primaryKey
    && !field.unique
    && !LIFECYCLE_FIELD_RE.test(fieldName)
    && !AUDIT_TIMESTAMP_RE.test(fieldName);
}

export function isConservativeSqlTypeWidening(baselineType: string, currentType: string): boolean {
  const baseline = baselineType.trim().toLowerCase();
  const current = currentType.trim().toLowerCase();

  return (
    (baseline === 'smallint' && (current === 'integer' || current === 'bigint'))
    || (baseline === 'integer' && current === 'bigint')
    || (baseline === 'real' && current === 'double precision')
  );
}

export function compareEntities(
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

    const baselineSingleFieldUniqueKeys = getSingleFieldUniqueKeys(baselineEntity);
    const currentSingleFieldUniqueKeys = getSingleFieldUniqueKeys(currentEntity);

    const baselineUniqueKeys = (baselineEntity.uniqueKeys || [])
      .filter((key) => key.length > 1)
      .map(normalizeUniqueKey)
      .sort();
    const currentUniqueKeys = (currentEntity.uniqueKeys || [])
      .filter((key) => key.length > 1)
      .map(normalizeUniqueKey)
      .sort();

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
        if (prefix === 'sql' && isConservativeSqlTypeWidening(baselineField.type, currentField.type)) {
          artifacts.push(buildComparisonFinding(
            sourceLabel,
            fileLabel,
            line,
            `schema/${prefix}-type-widening`,
            'warning',
            `Field ${baselineEntity.name}.${fieldName} widened type from ${baselineField.type} to ${currentField.type}`,
            `${baselineEntity.name}.${fieldName}: ${baselineField.type} -> ${currentField.type}`,
            'medium',
          ));
        } else {
          artifacts.push(buildBreakingFinding(
            sourceLabel,
            fileLabel,
            line,
            `schema/${prefix}-breaking-type-change`,
            `Field ${baselineEntity.name}.${fieldName} changed type from ${baselineField.type} to ${currentField.type}`,
            `${baselineEntity.name}.${fieldName}: ${baselineField.type} -> ${currentField.type}`,
          ));
        }
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
      } else if (!baselineField.nullable && currentField.nullable) {
        artifacts.push(buildComparisonFinding(
          sourceLabel,
          fileLabel,
          line,
          `schema/${prefix}-nullability-loosen`,
          'warning',
          `Field ${baselineEntity.name}.${fieldName} changed from required to nullable`,
          `${baselineEntity.name}.${fieldName}: required -> nullable`,
          'medium',
        ));
      }

      const baselineHasSingleFieldUniqueness = baselineField.unique
        || baselineSingleFieldUniqueKeys.has(fieldName);
      const currentHasSingleFieldUniqueness = currentField.unique
        || currentSingleFieldUniqueKeys.has(fieldName);

      if (baselineHasSingleFieldUniqueness && !currentHasSingleFieldUniqueness) {
        artifacts.push(buildComparisonFinding(
          sourceLabel,
          fileLabel,
          line,
          `schema/${prefix}-unique-removed`,
          'warning',
          `Field ${baselineEntity.name}.${fieldName} removed unique constraint`,
          `${baselineEntity.name}.${fieldName}: unique removed`,
          'medium',
        ));
      } else if (!baselineHasSingleFieldUniqueness && currentHasSingleFieldUniqueness) {
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
        const lowRiskDefaultRemoval = isLowRiskDefaultRemoval(fieldName, baselineField);
        artifacts.push(buildComparisonFinding(
          sourceLabel,
          fileLabel,
          line,
          `schema/${prefix}-default-removed`,
          lowRiskDefaultRemoval ? 'info' : 'warning',
          `Field ${baselineEntity.name}.${fieldName} removed default value ${baselineField.defaultValue || ''}`.trim(),
          `${baselineEntity.name}.${fieldName}: default removed`,
          lowRiskDefaultRemoval ? 'low' : 'medium',
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
        const baselineGenerated = isGeneratedDefaultValue(baselineField.defaultValue);
        const currentGenerated = isGeneratedDefaultValue(currentField.defaultValue);

        if (baselineGenerated && !currentGenerated) {
          artifacts.push(buildComparisonFinding(
            sourceLabel,
            fileLabel,
            line,
            `schema/${prefix}-breaking-default-generated-to-non-generated`,
            'error',
            `Field ${baselineEntity.name}.${fieldName} changed default value from generated ${baselineField.defaultValue} to non-generated ${currentField.defaultValue}`,
            `${baselineEntity.name}.${fieldName}: ${baselineField.defaultValue} -> ${currentField.defaultValue}`,
            'high',
          ));
        } else {
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

