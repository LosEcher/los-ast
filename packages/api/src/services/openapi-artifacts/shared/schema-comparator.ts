/**
 * OpenAPI Artifacts - Schema Comparator
 * Schema comparison, field collection, and shape analysis
 */

import type { OpenApiObject, ComparableField, ComparableDiscriminator } from './types.js';
import { isRecord, getSchemaObject } from './utils.js';
import { resolveObjectSchema } from './schema-resolver.js';

// Schema type inference
function inferSchemaType(document: OpenApiObject, schema: unknown): string {
  const schemaObject = resolveObjectSchema(document, getSchemaObject(schema));
  if (!schemaObject) {
    return 'object';
  }

  if (typeof schemaObject.type === 'string') {
    return schemaObject.type;
  }

  if (Array.isArray(schemaObject.enum)) {
    return 'enum';
  }

  return 'object';
}

function inferNullable(document: OpenApiObject, schema: unknown): boolean {
  const schemaObject = resolveObjectSchema(document, getSchemaObject(schema));
  if (!schemaObject) {
    return false;
  }

  if (schemaObject.nullable === true) {
    return true;
  }

  return Array.isArray(schemaObject.type) && schemaObject.type.includes('null');
}

// Normalization utilities
function normalizeEnumValues(values: unknown[] | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.map((value) => JSON.stringify(value)).sort();
}

function normalizeDefaultValue(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return JSON.stringify(value);
}

function normalizeValidationNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

// Validation extraction
function getComparableValidation(schema: Record<string, unknown>) {
  return {
    exclusiveMaximum: schema.exclusiveMaximum === true,
    exclusiveMinimum: schema.exclusiveMinimum === true,
    format: typeof schema.format === 'string' ? schema.format : undefined,
    maxItems: normalizeValidationNumber(schema.maxItems),
    maxLength: normalizeValidationNumber(schema.maxLength),
    maxProperties: normalizeValidationNumber(schema.maxProperties),
    maximum: normalizeValidationNumber(schema.maximum),
    minItems: normalizeValidationNumber(schema.minItems),
    minLength: normalizeValidationNumber(schema.minLength),
    minProperties: normalizeValidationNumber(schema.minProperties),
    minimum: normalizeValidationNumber(schema.minimum),
    multipleOf: normalizeValidationNumber(schema.multipleOf),
    pattern: typeof schema.pattern === 'string' ? schema.pattern : undefined,
    uniqueItems: schema.uniqueItems === true,
  };
}

// Discriminator extraction
function getComparableDiscriminator(schema: Record<string, unknown>): ComparableDiscriminator | undefined {
  if (!isRecord(schema.discriminator)) {
    return undefined;
  }

  const propertyName = typeof schema.discriminator.propertyName === 'string'
    ? schema.discriminator.propertyName
    : undefined;
  if (!propertyName) {
    return undefined;
  }

  const mappingKeys = isRecord(schema.discriminator.mapping)
    ? Object.keys(schema.discriminator.mapping).sort()
    : [];

  return {
    mappingKeys,
    propertyName,
  };
}

// Field comparison
function getComparableField(document: OpenApiObject, schema: unknown): ComparableField {
  const schemaObject = resolveObjectSchema(document, getSchemaObject(schema));
  if (!schemaObject) {
    return {
      enumValues: [],
      hasDefault: false,
      nullable: false,
      type: 'object',
      validation: {
        exclusiveMaximum: false,
        exclusiveMinimum: false,
        uniqueItems: false,
      },
    };
  }

  return {
    defaultValue: normalizeDefaultValue(schemaObject.default),
    enumValues: normalizeEnumValues(Array.isArray(schemaObject.enum) ? schemaObject.enum : undefined),
    hasDefault: Object.hasOwn(schemaObject, 'default'),
    nullable: inferNullable(document, schemaObject),
    type: inferSchemaType(document, schemaObject),
    validation: getComparableValidation(schemaObject),
  };
}

// Field collection for comparison
function collectComparableFields(
  document: OpenApiObject,
  schema: Record<string, unknown> | undefined,
  pathPrefix: string,
  ancestorRequired: boolean,
  properties: Map<string, ComparableField>,
  discriminators: Map<string, ComparableDiscriminator>,
  required: Set<string>
): void {
  const resolvedSchema = resolveObjectSchema(document, schema);
  if (!resolvedSchema) {
    return;
  }

  const discriminator = getComparableDiscriminator(resolvedSchema);
  if (discriminator) {
    discriminators.set(pathPrefix, discriminator);
  }

  if (resolvedSchema.type === 'array') {
    const arrayPath = `${pathPrefix}[]`;
    if (pathPrefix) {
      properties.set(pathPrefix, getComparableField(document, resolvedSchema));
      if (ancestorRequired) {
        required.add(pathPrefix);
      }
    }

    const itemSchema = resolveObjectSchema(document, getSchemaObject(resolvedSchema.items));
    if (!itemSchema) {
      properties.set(arrayPath, {
        enumValues: [],
        hasDefault: false,
        nullable: false,
        type: 'object',
        validation: {
          exclusiveMaximum: false,
          exclusiveMinimum: false,
          uniqueItems: false,
        },
      });
      if (ancestorRequired) {
        required.add(arrayPath);
      }
      return;
    }

    if (itemSchema.type === 'object' && isRecord(itemSchema.properties)) {
      collectComparableFields(document, itemSchema, arrayPath, ancestorRequired, properties, discriminators, required);
      return;
    }

    if (itemSchema.type === 'array') {
      collectComparableFields(document, itemSchema, arrayPath, ancestorRequired, properties, discriminators, required);
      return;
    }

    properties.set(arrayPath, getComparableField(document, itemSchema));
    if (ancestorRequired) {
      required.add(arrayPath);
    }
    return;
  }

  if (resolvedSchema.type === 'object' && isRecord(resolvedSchema.properties)) {
    const directRequired = new Set(
      Array.isArray(resolvedSchema.required)
        ? resolvedSchema.required.filter((item): item is string => typeof item === 'string')
        : []
    );

    for (const [propertyName, propertySchema] of Object.entries(resolvedSchema.properties)) {
      const nextPath = pathPrefix ? `${pathPrefix}.${propertyName}` : propertyName;
      const propertyRequired = ancestorRequired && directRequired.has(propertyName);
      collectComparableFields(
        document,
        getSchemaObject(propertySchema),
        nextPath,
        propertyRequired,
        properties,
        discriminators,
        required
      );
    }

    const additionalPropertiesSchema = getSchemaObject(resolvedSchema.additionalProperties);
    if (additionalPropertiesSchema) {
      const wildcardPath = pathPrefix ? `${pathPrefix}.*` : '*';
      collectComparableFields(
        document,
        additionalPropertiesSchema,
        wildcardPath,
        ancestorRequired,
        properties,
        discriminators,
        required
      );
    }
    return;
  }

  if (resolvedSchema.type === 'object') {
    const additionalPropertiesSchema = getSchemaObject(resolvedSchema.additionalProperties);
    if (additionalPropertiesSchema) {
      const wildcardPath = pathPrefix ? `${pathPrefix}.*` : '*';
      collectComparableFields(
        document,
        additionalPropertiesSchema,
        wildcardPath,
        ancestorRequired,
        properties,
        discriminators,
        required
      );
      return;
    }
  }

  if (!pathPrefix) {
    return;
  }

  properties.set(pathPrefix, getComparableField(document, resolvedSchema));
  if (ancestorRequired) {
    required.add(pathPrefix);
  }
}

// Main export: get comparable shape
export function getComparableObjectShape(document: OpenApiObject, schema: Record<string, unknown> | undefined): {
  discriminators: Map<string, ComparableDiscriminator>;
  properties: Map<string, ComparableField>;
  required: Set<string>;
  pathSuffix: string;
} {
  const resolvedSchema = resolveObjectSchema(document, schema);
  if (!resolvedSchema) {
    return {
      discriminators: new Map(),
      properties: new Map(),
      required: new Set(),
      pathSuffix: '',
    };
  }

  const objectSchema = resolvedSchema.type === 'array'
    ? resolveObjectSchema(document, getSchemaObject(resolvedSchema.items))
    : resolvedSchema;
  const pathSuffix = resolvedSchema.type === 'array' ? '[]' : '';

  if (!objectSchema) {
    return {
      discriminators: new Map(),
      properties: new Map(),
      required: new Set(),
      pathSuffix,
    };
  }

  const comparableProperties = new Map<string, ComparableField>();
  const discriminators = new Map<string, ComparableDiscriminator>();
  const required = new Set<string>();
  collectComparableFields(document, objectSchema, '', true, comparableProperties, discriminators, required);

  return { discriminators, properties: comparableProperties, required, pathSuffix };
}

// Discriminator excerpt builder
export function buildDiscriminatorExcerpt(
  prefix: string,
  pathSuffix: string,
  schemaPath: string,
  propertyName: string
): string {
  const path = schemaPath ? `.${schemaPath}` : '';
  return `${prefix}${pathSuffix}${path}#discriminator.${propertyName}`;
}
