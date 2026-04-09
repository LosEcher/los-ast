/**
 * Schema Artifacts - Types
 */

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
