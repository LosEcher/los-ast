import { parse as parseYaml } from 'yaml';
import type {
  OpenApiDocumentInput,
} from '@los-ast/shared/types';
import { ValidationError } from '../../types/errors.js';

export type OpenApiObject = {
  openapi?: string;
  security?: unknown[];
  paths?: Record<string, Record<string, unknown>>;
  components?: {
    schemas?: Record<string, unknown>;
  };
};

export type ComparableValidation = {
  format?: string;
  maxItems?: number;
  maxLength?: number;
  maxProperties?: number;
  maximum?: number;
  minItems?: number;
  minLength?: number;
  minProperties?: number;
  minimum?: number;
  pattern?: string;
  uniqueItems: boolean;
};

export type ComparableField = {
  defaultValue?: string;
  enumValues: string[];
  hasDefault: boolean;
  nullable: boolean;
  type: string;
  validation: ComparableValidation;
};

type ComparableDiscriminator = {
  mappingKeys: string[];
  propertyName: string;
};

export const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);
export const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function parseDocument(document: OpenApiDocumentInput, index: number): OpenApiObject {
  const sourceLabel = document.source || document.file || `openapi-${index + 1}`;

  try {
    if (document.format === 'json') {
      return JSON.parse(document.content) as OpenApiObject;
    }

    if (document.format === 'yaml') {
      return parseYaml(document.content) as OpenApiObject;
    }

    const trimmed = document.content.trim();
    if (trimmed.startsWith('{')) {
      return JSON.parse(trimmed) as OpenApiObject;
    }

    return parseYaml(document.content) as OpenApiObject;
  } catch (error) {
    throw new ValidationError(
      'INVALID_OPENAPI_DOCUMENT',
      `Failed to parse OpenAPI document: ${sourceLabel}`,
      {
        source: sourceLabel,
        reason: error instanceof Error ? error.message : String(error),
      }
    );
  }
}

export function ensureOpenApiShape(document: OpenApiObject, sourceLabel: string): void {
  if (!document.openapi || typeof document.openapi !== 'string' || !isRecord(document.paths)) {
    throw new ValidationError(
      'INVALID_OPENAPI_DOCUMENT',
      `OpenAPI document is missing required fields: ${sourceLabel}`,
      {
        source: sourceLabel,
        required: ['openapi', 'paths'],
      }
    );
  }
}

export function hasEffectiveSecurity(operation: Record<string, unknown>, rootSecurity: unknown[] | undefined): boolean {
  if (Array.isArray(operation.security)) {
    return operation.security.length > 0;
  }

  return Array.isArray(rootSecurity) && rootSecurity.length > 0;
}

function parseOperationLabel(operationLabel: string): { method: string; routePath: string } | null {
  const firstSpace = operationLabel.indexOf(' ');
  if (firstSpace <= 0 || firstSpace === operationLabel.length - 1) {
    return null;
  }

  return {
    method: operationLabel.slice(0, firstSpace).toLowerCase(),
    routePath: operationLabel.slice(firstSpace + 1),
  };
}

function getLeadingSpaceCount(line: string): number {
  const match = line.match(/^\s*/);
  return match ? match[0].length : 0;
}

function matchesStructuredKey(trimmedLine: string, key: string): boolean {
  return trimmedLine === `${key}:`
    || trimmedLine === `'${key}':`
    || trimmedLine === `"${key}":`
    || trimmedLine.startsWith(`${key}: `)
    || trimmedLine.startsWith(`'${key}': `)
    || trimmedLine.startsWith(`"${key}": `);
}

function findYamlOperationLine(content: string, routePath: string, method: string): number | undefined {
  const lines = content.split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !matchesStructuredKey(trimmed, routePath)) {
      continue;
    }

    const pathIndent = getLeadingSpaceCount(line);
    const pathLine = index + 1;

    for (let childIndex = index + 1; childIndex < lines.length; childIndex += 1) {
      const childLine = lines[childIndex];
      const childTrimmed = childLine.trim();
      if (!childTrimmed || childTrimmed.startsWith('#')) {
        continue;
      }

      const childIndent = getLeadingSpaceCount(childLine);
      if (childIndent <= pathIndent) {
        break;
      }

      if (childIndent === pathIndent + 2 && matchesStructuredKey(childTrimmed, method)) {
        return childIndex + 1;
      }
    }

    return pathLine;
  }

  return undefined;
}

function findJsonOperationLine(content: string, routePath: string, method: string): number | undefined {
  const lines = content.split(/\r?\n/u);
  let pathLine: number | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!pathLine && line.includes(`"${routePath}"`)) {
      pathLine = index + 1;
      continue;
    }

    if (pathLine && line.includes(`"${method}"`)) {
      return index + 1;
    }
  }

  return pathLine;
}

export function resolveOperationLine(document: OpenApiDocumentInput, operationLabel: string): number {
  const parsedLabel = parseOperationLabel(operationLabel);
  if (!parsedLabel) {
    return 1;
  }

  const format = document.format || (document.content.trim().startsWith('{') ? 'json' : 'yaml');
  const line = format === 'json'
    ? findJsonOperationLine(document.content, parsedLabel.routePath, parsedLabel.method)
    : findYamlOperationLine(document.content, parsedLabel.routePath, parsedLabel.method);

  return line || 1;
}

export function getOperations(document: OpenApiObject): Map<string, Record<string, unknown>> {
  const operations = new Map<string, Record<string, unknown>>();

  for (const [routePath, pathItem] of Object.entries(document.paths || {})) {
    if (!isRecord(pathItem)) {
      continue;
    }

    for (const [method, operationRaw] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method) || !isRecord(operationRaw)) {
        continue;
      }

      operations.set(`${method.toUpperCase()} ${routePath}`, operationRaw);
    }
  }

  return operations;
}

function getSchemaObject(schema: unknown): Record<string, unknown> | undefined {
  return isRecord(schema) ? schema : undefined;
}

function decodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

function resolveLocalRefTarget(document: OpenApiObject, ref: string): unknown {
  if (!ref.startsWith('#/')) {
    return undefined;
  }

  const segments = ref
    .slice(2)
    .split('/')
    .map((segment) => decodeJsonPointerSegment(segment));
  let cursor: unknown = document;

  for (const segment of segments) {
    if (Array.isArray(cursor)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) {
        return undefined;
      }
      cursor = cursor[index];
      continue;
    }

    if (!isRecord(cursor) || !Object.hasOwn(cursor, segment)) {
      return undefined;
    }

    cursor = cursor[segment];
  }

  return cursor;
}

function resolveLocalSchemaRef(
  document: OpenApiObject,
  schema: unknown,
  seen: Set<string> = new Set()
): Record<string, unknown> | undefined {
  const schemaObject = getSchemaObject(schema);
  if (!schemaObject) {
    return undefined;
  }

  const ref = typeof schemaObject.$ref === 'string' ? schemaObject.$ref : undefined;
  if (!ref) {
    return schemaObject;
  }

  if (!ref.startsWith('#/')) {
    return schemaObject;
  }

  if (seen.has(ref)) {
    return undefined;
  }

  const target = resolveLocalRefTarget(document, ref);
  if (!target) {
    return undefined;
  }

  seen.add(ref);
  return resolveLocalSchemaRef(document, target, seen) || getSchemaObject(target);
}

function resolveObjectSchema(
  document: OpenApiObject,
  schema: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!schema) {
    return undefined;
  }

  const resolved = resolveLocalSchemaRef(document, schema) || schema;
  let mergedSchema = resolved;
  const allOf = Array.isArray(resolved.allOf) ? resolved.allOf : [];

  if (allOf.length > 0) {
    const mergedProperties: Record<string, unknown> = {};
    const mergedRequired = new Set<string>();
    let mergedAdditionalProperties: unknown = undefined;
    let inheritedDiscriminator: unknown = undefined;
    let inheritedOneOf: unknown[] | undefined = undefined;
    let inheritedAnyOf: unknown[] | undefined = undefined;

    for (const subSchema of allOf) {
      const resolvedSubSchema = resolveObjectSchema(document, getSchemaObject(subSchema));
      if (!resolvedSubSchema) {
        continue;
      }

      if (isRecord(resolvedSubSchema.properties)) {
        Object.assign(mergedProperties, resolvedSubSchema.properties);
      }

      if (Array.isArray(resolvedSubSchema.required)) {
        for (const requiredField of resolvedSubSchema.required) {
          if (typeof requiredField === 'string') {
            mergedRequired.add(requiredField);
          }
        }
      }

      if (typeof mergedAdditionalProperties === 'undefined' && typeof resolvedSubSchema.additionalProperties !== 'undefined') {
        mergedAdditionalProperties = resolvedSubSchema.additionalProperties;
      }

      if (typeof inheritedDiscriminator === 'undefined' && typeof resolvedSubSchema.discriminator !== 'undefined') {
        inheritedDiscriminator = resolvedSubSchema.discriminator;
      }

      if (!inheritedOneOf && Array.isArray(resolvedSubSchema.oneOf)) {
        inheritedOneOf = resolvedSubSchema.oneOf;
      }

      if (!inheritedAnyOf && Array.isArray(resolvedSubSchema.anyOf)) {
        inheritedAnyOf = resolvedSubSchema.anyOf;
      }
    }

    if (isRecord(resolved.properties)) {
      Object.assign(mergedProperties, resolved.properties);
    }

    if (Array.isArray(resolved.required)) {
      for (const requiredField of resolved.required) {
        if (typeof requiredField === 'string') {
          mergedRequired.add(requiredField);
        }
      }
    }

    if (typeof resolved.additionalProperties !== 'undefined') {
      mergedAdditionalProperties = resolved.additionalProperties;
    }

    mergedSchema = {
      ...resolved,
      type: resolved.type || 'object',
      properties: mergedProperties,
      additionalProperties: mergedAdditionalProperties,
      discriminator: typeof resolved.discriminator !== 'undefined' ? resolved.discriminator : inheritedDiscriminator,
      oneOf: Array.isArray(resolved.oneOf) ? resolved.oneOf : inheritedOneOf,
      anyOf: Array.isArray(resolved.anyOf) ? resolved.anyOf : inheritedAnyOf,
      required: Array.from(mergedRequired),
    };
  }

  const variantSchemas = Array.isArray(mergedSchema.oneOf)
    ? mergedSchema.oneOf
    : Array.isArray(mergedSchema.anyOf)
      ? mergedSchema.anyOf
      : [];
  if (variantSchemas.length === 0) {
    return mergedSchema;
  }

  const resolvedVariants = variantSchemas
    .map((subSchema) => resolveObjectSchema(document, getSchemaObject(subSchema)))
    .filter((subSchema): subSchema is Record<string, unknown> => !!subSchema && isRecord(subSchema.properties));
  if (resolvedVariants.length === 0) {
    return mergedSchema;
  }

  const directProperties = isRecord(mergedSchema.properties) ? { ...mergedSchema.properties } : {};
  const directRequired = new Set(
    Array.isArray(mergedSchema.required)
      ? mergedSchema.required.filter((item): item is string => typeof item === 'string')
      : []
  );

  const [firstVariant, ...restVariants] = resolvedVariants;
  const commonProperties = new Map<string, unknown>(Object.entries(firstVariant.properties as Record<string, unknown>));
  const commonRequired = new Set(
    Array.isArray(firstVariant.required)
      ? firstVariant.required.filter((item): item is string => typeof item === 'string')
      : []
  );

  for (const variant of restVariants) {
    const variantProperties = isRecord(variant.properties) ? variant.properties : {};
    const variantRequired = new Set(
      Array.isArray(variant.required)
        ? variant.required.filter((item): item is string => typeof item === 'string')
        : []
    );

    for (const [propertyName, propertySchema] of Array.from(commonProperties.entries())) {
      const nextPropertySchema = variantProperties[propertyName];
      if (!nextPropertySchema) {
        commonProperties.delete(propertyName);
        commonRequired.delete(propertyName);
        continue;
      }

      if (inferSchemaType(document, propertySchema) !== inferSchemaType(document, nextPropertySchema)) {
        commonProperties.delete(propertyName);
        commonRequired.delete(propertyName);
        continue;
      }

      if (!variantRequired.has(propertyName)) {
        commonRequired.delete(propertyName);
      }
    }
  }

  for (const [propertyName, propertySchema] of commonProperties.entries()) {
    directProperties[propertyName] = propertySchema;
  }

  const mergedRequired = new Set([...directRequired, ...commonRequired]);

  return {
    ...mergedSchema,
    type: mergedSchema.type || 'object',
    properties: directProperties,
    required: Array.from(mergedRequired),
  };
}

function inferSchemaType(
  document: OpenApiObject,
  schema: unknown
): string {
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

function inferNullable(
  document: OpenApiObject,
  schema: unknown
): boolean {
  const schemaObject = resolveObjectSchema(document, getSchemaObject(schema));
  if (!schemaObject) {
    return false;
  }

  if (schemaObject.nullable === true) {
    return true;
  }

  return Array.isArray(schemaObject.type) && schemaObject.type.includes('null');
}

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

function getComparableValidation(schema: Record<string, unknown>): ComparableValidation {
  return {
    format: typeof schema.format === 'string' ? schema.format : undefined,
    maxItems: normalizeValidationNumber(schema.maxItems),
    maxLength: normalizeValidationNumber(schema.maxLength),
    maxProperties: normalizeValidationNumber(schema.maxProperties),
    maximum: normalizeValidationNumber(schema.maximum),
    minItems: normalizeValidationNumber(schema.minItems),
    minLength: normalizeValidationNumber(schema.minLength),
    minProperties: normalizeValidationNumber(schema.minProperties),
    minimum: normalizeValidationNumber(schema.minimum),
    pattern: typeof schema.pattern === 'string' ? schema.pattern : undefined,
    uniqueItems: schema.uniqueItems === true,
  };
}

function getComparableDiscriminator(
  schema: Record<string, unknown>
): ComparableDiscriminator | undefined {
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

function getComparableField(
  document: OpenApiObject,
  schema: unknown
): ComparableField {
  const schemaObject = resolveObjectSchema(document, getSchemaObject(schema));
  if (!schemaObject) {
    return {
      enumValues: [],
      hasDefault: false,
      nullable: false,
      type: 'object',
      validation: {
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

function getJsonContentSchema(container: unknown): Record<string, unknown> | undefined {
  if (!isRecord(container) || !isRecord(container.content)) {
    return undefined;
  }

  const contentEntries = Object.entries(container.content).find(([contentType]) =>
    contentType === 'application/json' || contentType.endsWith('+json')
  );
  if (!contentEntries) {
    return undefined;
  }

  const [, mediaType] = contentEntries;
  if (!isRecord(mediaType)) {
    return undefined;
  }

  return getSchemaObject(mediaType.schema);
}

export function getRequestSchema(operation: Record<string, unknown>): Record<string, unknown> | undefined {
  return getJsonContentSchema(operation.requestBody);
}

export function getSuccessResponseSchemas(operation: Record<string, unknown>): Map<string, Record<string, unknown>> {
  const schemas = new Map<string, Record<string, unknown>>();
  if (!isRecord(operation.responses)) {
    return schemas;
  }

  for (const [status, response] of Object.entries(operation.responses)) {
    if (!/^2\d\d$/.test(status) && status !== 'default') {
      continue;
    }

    const schema = getJsonContentSchema(response);
    if (schema) {
      schemas.set(status, schema);
    }
  }

  return schemas;
}

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

export function buildDiscriminatorExcerpt(
  prefix: string,
  pathSuffix: string,
  schemaPath: string,
  propertyName: string
): string {
  const path = schemaPath ? `.${schemaPath}` : '';
  return `${prefix}${pathSuffix}${path}#discriminator.${propertyName}`;
}
