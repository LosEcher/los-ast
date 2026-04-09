/**
 * Schema Artifacts - Normalizer
 * Type normalization utilities
 */

function cleanSqlIdentifier(value: string): string {
  return value.replace(/^[`"'[]+|[`"'\]]+$/g, '');
}

function normalizeType(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeSqlType(value: string): string {
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

export function isSequenceBackedSqlType(typeToken: string | undefined): boolean {
  const normalized = typeToken ? normalizeType(typeToken) : '';
  return normalized === 'serial' || normalized === 'bigserial';
}

export function normalizeDefaultValue(value: string | undefined): string | undefined {
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

export { cleanSqlIdentifier, normalizeType };
