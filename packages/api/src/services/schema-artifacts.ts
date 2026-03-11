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
  primaryKey: boolean;
};
type SchemaEntity = {
  name: string;
  fields: Map<string, SchemaField>;
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

      const columnMatch = normalizedLine.match(/^([`"\[\]\w]+)\s+([A-Za-z0-9()_]+)/);
      if (!columnMatch) {
        continue;
      }

      const fieldName = cleanSqlIdentifier(columnMatch[1]);
      fields.set(fieldName, {
        type: normalizeType(columnMatch[2]),
        nullable: !/\bnot\s+null\b/i.test(lowerLine) && !/\bprimary\s+key\b/i.test(lowerLine),
        hasDefault: /\bdefault\b/i.test(lowerLine),
        primaryKey: /\bprimary\s+key\b/i.test(lowerLine),
      });
    }

    for (const primaryKeyField of tablePrimaryKeys) {
      const field = fields.get(primaryKeyField);
      if (field) {
        field.primaryKey = true;
      }
    }

    entities.push({ name: tableName, fields });
  }

  return entities;
}

function parsePrismaEntities(content: string): SchemaEntity[] {
  const entities: SchemaEntity[] = [];
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
    for (const rawLine of rawLines) {
      const fieldMatch = rawLine.match(/^(\w+)\s+([A-Za-z][A-Za-z0-9]*\??)/);
      if (!fieldMatch) {
        continue;
      }

      const typeToken = fieldMatch[2];
      fields.set(fieldMatch[1], {
        type: normalizeType(typeToken.replace(/\?$/, '')),
        nullable: typeToken.endsWith('?'),
        hasDefault: /@default\s*\(/.test(rawLine) || /@updatedAt\b/.test(rawLine),
        primaryKey: /@id\b/.test(rawLine),
      });
    }

    entities.push({ name: modelName, fields });
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
  return {
    source: sourceLabel,
    ruleId,
    severity: 'error',
    message,
    file: fileLabel,
    language: 'schema',
    line,
    column: 0,
    excerpt,
    governanceDomain: ['database', 'interface'],
    impactHint: 'high',
  };
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
