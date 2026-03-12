import type {
  SchemaArtifactFindingInput,
  SchemaComparisonInput,
  SchemaDocumentInput,
} from '@los-ast/shared/types';
import { ValidationError } from '../types/errors.js';

const SENSITIVE_FIELD_RE = /(email|phone|mobile|token|secret|password)/i;
const LIFECYCLE_FIELD_RE = /^(status|state)$/i;
const AUDIT_TIMESTAMP_RE = /^(created_at|updated_at|createdAt|updatedAt)$/i;

type ParsedSchemaFormat = 'sql' | 'prisma';
type SchemaField = {
  type: string;
  nullable: boolean;
  hasDefault: boolean;
  defaultValue?: string;
  primaryKey: boolean;
  unique: boolean;
  enumValues?: string[];
};
type SchemaEntity = {
  name: string;
  fields: Map<string, SchemaField>;
  uniqueKeys: string[][];
};

function inferFormat(document: { source?: string; file?: string; content: string; format?: 'sql' | 'prisma' }): ParsedSchemaFormat {
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

  throw new ValidationError(
    'INVALID_SCHEMA_DOCUMENT',
    `Unable to infer schema document format: ${document.source || document.file || 'schema-document'}`,
  );
}

function cleanSqlIdentifier(value: string): string {
  return value.replace(/^[`"'[]+|[`"'\]]+$/g, '');
}

function normalizeType(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeDefaultValue(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  let normalized = value.trim().replace(/^["']|["']$/g, '');

  while (normalized.startsWith('(') && normalized.endsWith(')')) {
    normalized = normalized.slice(1, -1).trim();
  }

  normalized = normalized.toLowerCase();

  if (
    normalized === 'now()'
    || normalized === 'current_timestamp'
    || normalized === 'current_timestamp()'
    || /^current_timestamp\(\d+\)$/.test(normalized)
  ) {
    return '@current_timestamp';
  }

  if (
    normalized === 'gen_random_uuid()'
    || normalized === 'uuid_generate_v4()'
  ) {
    return '@generated_uuid';
  }

  return normalized;
}

function extractSqlTypeToken(definition: string): string | undefined {
  const trimmed = definition.trim();
  if (/^enum\s*\(/i.test(trimmed)) {
    const match = trimmed.match(/^(enum\s*\([^)]*\))/i);
    return match ? match[1] : undefined;
  }

  const match = trimmed.match(/^([A-Za-z0-9_]+(?:\([^)]*\))?)/);
  return match ? match[1] : undefined;
}

function parseSqlEnumValues(typeToken: string | undefined): string[] | undefined {
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

function extractSqlDefaultValue(definition: string): string | undefined {
  const match = definition.match(/\bdefault\s+(.+?)(?:\s+(?:not null|null|primary key|unique|references)\b|$)/i);
  return normalizeDefaultValue(match?.[1]);
}

function parsePrismaEnums(content: string): Map<string, string[]> {
  const enums = new Map<string, string[]>();
  const enumRegex = /enum\s+(\w+)\s*\{([\s\S]*?)\}/g;
  let match: RegExpExecArray | null;

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

function extractPrismaDefaultValue(rawLine: string): string | undefined {
  const match = rawLine.match(/@default\s*\((.+)\)/);
  return normalizeDefaultValue(match?.[1]);
}

function parseSqlEntities(content: string): SchemaEntity[] {
  const entities: SchemaEntity[] = [];
  const tableRegex = /create\s+table\s+([^\s(]+)\s*\(([\s\S]*?)\);/gi;
  let match: RegExpExecArray | null;

  while ((match = tableRegex.exec(content)) !== null) {
    const tableName = cleanSqlIdentifier(match[1]);
    const block = match[2];
    const rawLines = block
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);

    const fields = new Map<string, SchemaField>();
    const tablePrimaryKeys = new Set<string>();
    const tableUniqueKeys: string[][] = [];

    for (const rawLine of rawLines) {
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
        tableUniqueKeys.push(
          uniqueMatch[1].split(',').map((item) => cleanSqlIdentifier(item.trim())).filter(Boolean)
        );
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
        type: normalizeType(typeToken),
        nullable: !/\bnot\s+null\b/i.test(lowerLine) && !/\bprimary\s+key\b/i.test(lowerLine),
        hasDefault: /\bdefault\b/i.test(lowerLine),
        defaultValue: extractSqlDefaultValue(definition),
        primaryKey: /\bprimary\s+key\b/i.test(lowerLine),
        unique: /\bunique\b/i.test(lowerLine) && !/\bprimary\s+key\b/i.test(lowerLine),
        enumValues: parseSqlEnumValues(typeToken),
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

function parsePrismaEntities(content: string): SchemaEntity[] {
  const entities: SchemaEntity[] = [];
  const enums = parsePrismaEnums(content);
  const modelRegex = /model\s+(\w+)\s*\{([\s\S]*?)\}/g;
  let match: RegExpExecArray | null;

  while ((match = modelRegex.exec(content)) !== null) {
    const modelName = match[1];
    const block = match[2];
    const rawLines = block
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => !item.startsWith('//'));

    const fields = new Map<string, SchemaField>();
    const compositePrimaryKeys = new Set<string>();
    const compositeUniqueKeys: string[][] = [];
    for (const rawLine of rawLines) {
      const compositeIdMatch = rawLine.match(/^@@id\s*\(\s*\[([^\]]+)\]/);
      if (compositeIdMatch) {
        for (const key of compositeIdMatch[1].split(',').map((item) => item.trim()).filter(Boolean)) {
          compositePrimaryKeys.add(key);
        }
        continue;
      }
      const compositeUniqueMatch = rawLine.match(/^@@unique\s*\(\s*\[([^\]]+)\]/);
      if (compositeUniqueMatch) {
        compositeUniqueKeys.push(
          compositeUniqueMatch[1].split(',').map((item) => item.trim()).filter(Boolean)
        );
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

function buildSqlArtifacts(document: SchemaDocumentInput, sourceLabel: string, fileLabel: string): SchemaArtifactFindingInput[] {
  const artifacts: SchemaArtifactFindingInput[] = [];
  const entities = parseSqlEntities(document.content);
  let line = 1;

  for (const entity of entities) {
    const rawLines = document.content
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
    const hasPrimaryKey = Array.from(entity.fields.values()).some((field) => field.primaryKey);

    for (const rawLine of rawLines) {
      const normalizedLine = rawLine.replace(/,$/, '');
      const lowerLine = normalizedLine.toLowerCase();
      const columnMatch = normalizedLine.match(/^([`"\[\]\w]+)\s+([A-Za-z0-9()_]+)/);
      if (!columnMatch) {
        continue;
      }

      const fieldName = cleanSqlIdentifier(columnMatch[1]);
      const fieldType = columnMatch[2];
      const isNullable = !/\bnot\s+null\b/i.test(lowerLine) && !/\bprimary\s+key\b/i.test(lowerLine);
      const hasDefault = /\bdefault\b/i.test(lowerLine);

      if (SENSITIVE_FIELD_RE.test(fieldName) && isNullable) {
        artifacts.push({
          source: sourceLabel,
          ruleId: 'schema/sql-sensitive-nullable',
          severity: 'warning',
          message: `Sensitive column ${entity.name}.${fieldName} should not be nullable`,
          file: fileLabel,
          language: 'schema',
          line,
          column: 0,
          excerpt: normalizedLine,
          governanceDomain: ['database'],
          impactHint: 'medium',
        });
      }

      if (LIFECYCLE_FIELD_RE.test(fieldName) && !isNullable && !hasDefault) {
        artifacts.push({
          source: sourceLabel,
          ruleId: 'schema/sql-lifecycle-default',
          severity: 'warning',
          message: `Lifecycle column ${entity.name}.${fieldName} should declare a default value`,
          file: fileLabel,
          language: 'schema',
          line,
          column: 0,
          excerpt: normalizedLine,
          governanceDomain: ['database', 'interface'],
          impactHint: 'medium',
        });
      }

      if (AUDIT_TIMESTAMP_RE.test(fieldName) && /(timestamp|datetime)/i.test(fieldType) && !hasDefault) {
        artifacts.push({
          source: sourceLabel,
          ruleId: 'schema/sql-audit-timestamp-default',
          severity: 'info',
          message: `Audit timestamp ${entity.name}.${fieldName} should declare a default value`,
          file: fileLabel,
          language: 'schema',
          line,
          column: 0,
          excerpt: normalizedLine,
          governanceDomain: ['database'],
          impactHint: 'low',
        });
      }
    }

    if (!hasPrimaryKey) {
      artifacts.push({
        source: sourceLabel,
        ruleId: 'schema/sql-primary-key',
        severity: 'error',
        message: `Table ${entity.name} should declare a primary key`,
        file: fileLabel,
        language: 'schema',
        line,
        column: 0,
        excerpt: `CREATE TABLE ${entity.name}`,
        governanceDomain: ['database'],
        impactHint: 'high',
      });
    }

    line += Math.max(1, entity.fields.size);
  }

  return artifacts;
}

function buildPrismaArtifacts(document: SchemaDocumentInput, sourceLabel: string, fileLabel: string): SchemaArtifactFindingInput[] {
  const artifacts: SchemaArtifactFindingInput[] = [];
  const entities = parsePrismaEntities(document.content);
  let line = 1;

  for (const entity of entities) {
    const rawLines = document.content
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => !item.startsWith('//'));
    const hasPrimaryKey = Array.from(entity.fields.values()).some((field) => field.primaryKey) || /@@id\b/.test(document.content);

    for (const rawLine of rawLines) {
      const fieldMatch = rawLine.match(/^(\w+)\s+([A-Za-z][A-Za-z0-9]*\??)/);
      if (!fieldMatch) {
        continue;
      }

      const fieldName = fieldMatch[1];
      const typeToken = fieldMatch[2];
      const isNullable = typeToken.endsWith('?') && !/@id\b/.test(rawLine);
      const hasDefault = /@default\s*\(/.test(rawLine);
      const hasUpdatedAt = /@updatedAt\b/.test(rawLine);

      if (SENSITIVE_FIELD_RE.test(fieldName) && isNullable) {
        artifacts.push({
          source: sourceLabel,
          ruleId: 'schema/prisma-sensitive-nullable',
          severity: 'warning',
          message: `Sensitive field ${entity.name}.${fieldName} should not be optional`,
          file: fileLabel,
          language: 'schema',
          line,
          column: 0,
          excerpt: rawLine,
          governanceDomain: ['database'],
          impactHint: 'medium',
        });
      }

      if (LIFECYCLE_FIELD_RE.test(fieldName) && !isNullable && !hasDefault) {
        artifacts.push({
          source: sourceLabel,
          ruleId: 'schema/prisma-lifecycle-default',
          severity: 'warning',
          message: `Lifecycle field ${entity.name}.${fieldName} should declare @default(...)`,
          file: fileLabel,
          language: 'schema',
          line,
          column: 0,
          excerpt: rawLine,
          governanceDomain: ['database', 'interface'],
          impactHint: 'medium',
        });
      }

      if (AUDIT_TIMESTAMP_RE.test(fieldName) && /^DateTime\??$/.test(typeToken) && !hasDefault && !hasUpdatedAt) {
        artifacts.push({
          source: sourceLabel,
          ruleId: 'schema/prisma-audit-timestamp-default',
          severity: 'info',
          message: `Audit field ${entity.name}.${fieldName} should declare @default(now()) or @updatedAt`,
          file: fileLabel,
          language: 'schema',
          line,
          column: 0,
          excerpt: rawLine,
          governanceDomain: ['database'],
          impactHint: 'low',
        });
      }
    }

    if (!hasPrimaryKey) {
      artifacts.push({
        source: sourceLabel,
        ruleId: 'schema/prisma-primary-key',
        severity: 'error',
        message: `Model ${entity.name} should declare an id field or @@id`,
        file: fileLabel,
        language: 'schema',
        line,
        column: 0,
        excerpt: `model ${entity.name}`,
        governanceDomain: ['database'],
        impactHint: 'high',
      });
    }

    line += Math.max(1, entity.fields.size);
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

      if (baselineField.nullable && !currentField.nullable && !currentField.hasDefault) {
        artifacts.push(buildBreakingFinding(
          sourceLabel,
          fileLabel,
          line,
          `schema/${prefix}-breaking-nullability-tighten`,
          `Field ${baselineEntity.name}.${fieldName} changed from nullable to required without default`,
          `${baselineEntity.name}.${fieldName}`,
        ));
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
      } else if (!baselineField.hasDefault && currentField.hasDefault) {
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
