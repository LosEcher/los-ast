import { ValidationError } from '../../types/errors.js';

export type ParsedSchemaFormat = 'sql' | 'prisma';

export type SchemaField = {
  type: string;
  nullable: boolean;
  hasDefault: boolean;
  defaultValue?: string;
  primaryKey: boolean;
  unique: boolean;
  enumValues?: string[];
  line: number;
  excerpt: string;
};

export type SchemaEntity = {
  name: string;
  fields: Map<string, SchemaField>;
  uniqueKeys: string[][];
};

export function inferFormat(document: { source?: string; file?: string; content: string; format?: 'sql' | 'prisma' }): ParsedSchemaFormat {
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

function normalizeSqlType(value: string): string {
  const normalized = normalizeType(value);
  if (normalized === 'double precision') {
    return 'double precision';
  }

  const timestampWithTimeZoneMatch = normalized.match(/^timestamp(?:\(([^)]*)\))?\s+with\s+time\s+zone$/);
  if (timestampWithTimeZoneMatch) {
    return timestampWithTimeZoneMatch[1]
      ? `timestamp(${timestampWithTimeZoneMatch[1].replace(/\s+/g, '')}) with time zone`
      : 'timestamp with time zone';
  }

  const timestampWithoutTimeZoneMatch = normalized.match(/^timestamp(?:\(([^)]*)\))?\s+without\s+time\s+zone$/);
  if (timestampWithoutTimeZoneMatch) {
    return timestampWithoutTimeZoneMatch[1]
      ? `timestamp(${timestampWithoutTimeZoneMatch[1].replace(/\s+/g, '')})`
      : 'timestamp';
  }

  const timeWithTimeZoneMatch = normalized.match(/^time(?:\(([^)]*)\))?\s+with\s+time\s+zone$/);
  if (timeWithTimeZoneMatch) {
    return timeWithTimeZoneMatch[1]
      ? `time(${timeWithTimeZoneMatch[1].replace(/\s+/g, '')}) with time zone`
      : 'time with time zone';
  }

  const timeWithoutTimeZoneMatch = normalized.match(/^time(?:\(([^)]*)\))?\s+without\s+time\s+zone$/);
  if (timeWithoutTimeZoneMatch) {
    return timeWithoutTimeZoneMatch[1]
      ? `time(${timeWithoutTimeZoneMatch[1].replace(/\s+/g, '')})`
      : 'time';
  }

  const timestampAliasMatch = normalized.match(/^(timestamptz|timetz)(?:\(([^)]*)\))?$/);
  if (timestampAliasMatch) {
    const [, alias, precision] = timestampAliasMatch;
    if (alias === 'timestamptz') {
      return precision ? `timestamp(${precision.replace(/\s+/g, '')}) with time zone` : 'timestamp with time zone';
    }

    return precision ? `time(${precision.replace(/\s+/g, '')}) with time zone` : 'time with time zone';
  }

  const parameterizedMatch = normalized.match(/^([a-z0-9_]+)\(([^)]*)\)$/);
  if (parameterizedMatch) {
    const [, rawBaseType, params] = parameterizedMatch;
    const baseType = normalizeSqlType(rawBaseType);
    if (baseType === rawBaseType) {
      return `${baseType}(${params.replace(/\s+/g, '')})`;
    }

    return `${baseType}(${params.replace(/\s+/g, '')})`;
  }

  if (normalized === 'int' || normalized === 'int4') {
    return 'integer';
  }

  if (normalized === 'int8') {
    return 'bigint';
  }

  if (normalized === 'bool') {
    return 'boolean';
  }

  if (normalized === 'decimal') {
    return 'numeric';
  }

  if (normalized === 'serial') {
    return 'integer';
  }

  if (normalized === 'bigserial') {
    return 'bigint';
  }

  if (normalized === 'float8') {
    return 'double precision';
  }

  return normalized;
}

function isSequenceBackedSqlType(typeToken: string | undefined): boolean {
  const normalized = typeToken ? normalizeType(typeToken) : '';
  return normalized === 'serial' || normalized === 'bigserial';
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

  const dbGeneratedMatch = normalized.match(/^dbgenerated\((.+)\)$/);
  if (dbGeneratedMatch) {
    return normalizeDefaultValue(dbGeneratedMatch[1]);
  }

  if (
    normalized === 'now()'
    || normalized === 'current_timestamp'
    || normalized === 'current_timestamp()'
    || /^current_timestamp\(\d+\)$/.test(normalized)
  ) {
    return '@current_timestamp';
  }

  if (
    normalized === 'uuid()'
    || normalized === 'gen_random_uuid()'
    || normalized === 'uuid_generate_v4()'
  ) {
    return '@generated_uuid';
  }

  if (
    normalized === 'autoincrement()'
    || /^nextval\(.+\)$/.test(normalized)
  ) {
    return '@generated_increment';
  }

  return normalized;
}

function extractSqlTypeToken(definition: string): string | undefined {
  const trimmed = definition.trim();
  if (/^enum\s*\(/i.test(trimmed)) {
    const match = trimmed.match(/^(enum\s*\([^)]*\))/i);
    return match ? match[1] : undefined;
  }

  const compoundMatch = trimmed.match(
    /^(timestamp(?:\([^)]*\))?\s+(?:with|without)\s+time\s+zone|time(?:\([^)]*\))?\s+(?:with|without)\s+time\s+zone|double\s+precision)/i,
  );
  if (compoundMatch) {
    return compoundMatch[1];
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

export function parseSqlEntities(content: string): SchemaEntity[] {
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

export function parsePrismaEntities(content: string): SchemaEntity[] {
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
