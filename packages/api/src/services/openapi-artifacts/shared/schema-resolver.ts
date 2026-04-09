/**
 * OpenAPI Artifacts - Schema Resolver
 * Schema reference resolution and object schema merging
 */

import type { OpenApiObject } from './types.js';
import { isRecord, getSchemaObject } from './utils.js';

// JSON Pointer utilities
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

export function resolveLocalSchemaRef(
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

export function resolveObjectSchema(
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

      // Type comparison would need inferSchemaType from comparator
      // For now, keep the property
      commonProperties.set(propertyName, propertySchema);

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
