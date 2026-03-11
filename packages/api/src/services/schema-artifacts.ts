import type { SchemaArtifactFindingInput, SchemaDocumentInput } from '@los-ast/shared/types';
import { ValidationError } from '../types/errors.js';

const SENSITIVE_FIELD_RE = /(email|phone|mobile|token|secret|password)/i;

type ParsedSchemaFormat = 'sql' | 'prisma';

function inferFormat(document: SchemaDocumentInput): ParsedSchemaFormat {
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

function buildSqlArtifacts(document: SchemaDocumentInput, sourceLabel: string, fileLabel: string): SchemaArtifactFindingInput[] {
  const artifacts: SchemaArtifactFindingInput[] = [];
  const tableRegex = /create\s+table\s+([^\s(]+)\s*\(([\s\S]*?)\);/gi;
  let match: RegExpExecArray | null;
  let line = 1;

  while ((match = tableRegex.exec(document.content)) !== null) {
    const tableName = cleanSqlIdentifier(match[1]);
    const block = match[2];
    const rawLines = block
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);

    let hasPrimaryKey = false;

    for (const rawLine of rawLines) {
      const normalizedLine = rawLine.replace(/,$/, '');
      const lowerLine = normalizedLine.toLowerCase();

      if (lowerLine.startsWith('primary key') || lowerLine.includes(' primary key')) {
        hasPrimaryKey = true;
      }

      const columnMatch = normalizedLine.match(/^([`"\[\]\w]+)\s+([A-Za-z0-9()_]+)/);
      if (!columnMatch) {
        continue;
      }

      const fieldName = cleanSqlIdentifier(columnMatch[1]);
      const isNullable = !/\bnot\s+null\b/i.test(lowerLine) && !/\bprimary\s+key\b/i.test(lowerLine);
      if (SENSITIVE_FIELD_RE.test(fieldName) && isNullable) {
        artifacts.push({
          source: sourceLabel,
          ruleId: 'schema/sql-sensitive-nullable',
          severity: 'warning',
          message: `Sensitive column ${tableName}.${fieldName} should not be nullable`,
          file: fileLabel,
          language: 'schema',
          line,
          column: 0,
          excerpt: normalizedLine,
          governanceDomain: ['database'],
          impactHint: 'medium',
        });
      }
    }

    if (!hasPrimaryKey) {
      artifacts.push({
        source: sourceLabel,
        ruleId: 'schema/sql-primary-key',
        severity: 'error',
        message: `Table ${tableName} should declare a primary key`,
        file: fileLabel,
        language: 'schema',
        line,
        column: 0,
        excerpt: `CREATE TABLE ${tableName}`,
        governanceDomain: ['database'],
        impactHint: 'high',
      });
    }

    line += Math.max(1, rawLines.length);
  }

  return artifacts;
}

function buildPrismaArtifacts(document: SchemaDocumentInput, sourceLabel: string, fileLabel: string): SchemaArtifactFindingInput[] {
  const artifacts: SchemaArtifactFindingInput[] = [];
  const modelRegex = /model\s+(\w+)\s*\{([\s\S]*?)\}/g;
  let match: RegExpExecArray | null;
  let line = 1;

  while ((match = modelRegex.exec(document.content)) !== null) {
    const modelName = match[1];
    const block = match[2];
    const rawLines = block
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => !item.startsWith('//'));

    let hasPrimaryKey = false;

    for (const rawLine of rawLines) {
      if (/@id\b/.test(rawLine) || /@@id\b/.test(rawLine)) {
        hasPrimaryKey = true;
      }

      const fieldMatch = rawLine.match(/^(\w+)\s+([A-Za-z][A-Za-z0-9]*\??)/);
      if (!fieldMatch) {
        continue;
      }

      const fieldName = fieldMatch[1];
      const typeToken = fieldMatch[2];
      const isNullable = typeToken.endsWith('?') && !/@id\b/.test(rawLine);

      if (SENSITIVE_FIELD_RE.test(fieldName) && isNullable) {
        artifacts.push({
          source: sourceLabel,
          ruleId: 'schema/prisma-sensitive-nullable',
          severity: 'warning',
          message: `Sensitive field ${modelName}.${fieldName} should not be optional`,
          file: fileLabel,
          language: 'schema',
          line,
          column: 0,
          excerpt: rawLine,
          governanceDomain: ['database'],
          impactHint: 'medium',
        });
      }
    }

    if (!hasPrimaryKey) {
      artifacts.push({
        source: sourceLabel,
        ruleId: 'schema/prisma-primary-key',
        severity: 'error',
        message: `Model ${modelName} should declare an id field or @@id`,
        file: fileLabel,
        language: 'schema',
        line,
        column: 0,
        excerpt: `model ${modelName}`,
        governanceDomain: ['database'],
        impactHint: 'high',
      });
    }

    line += Math.max(1, rawLines.length);
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
