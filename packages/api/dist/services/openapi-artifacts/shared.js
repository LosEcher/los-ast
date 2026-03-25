import { parse as parseYaml } from 'yaml';
import { ValidationError } from '../../types/errors.js';
export const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);
export const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);
export function isRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function parseDocument(document, index) {
    const sourceLabel = document.source || document.file || `openapi-${index + 1}`;
    try {
        if (document.format === 'json') {
            return JSON.parse(document.content);
        }
        if (document.format === 'yaml') {
            return parseYaml(document.content);
        }
        const trimmed = document.content.trim();
        if (trimmed.startsWith('{')) {
            return JSON.parse(trimmed);
        }
        return parseYaml(document.content);
    }
    catch (error) {
        throw new ValidationError('INVALID_OPENAPI_DOCUMENT', `Failed to parse OpenAPI document: ${sourceLabel}`, {
            source: sourceLabel,
            reason: error instanceof Error ? error.message : String(error),
        });
    }
}
export function ensureOpenApiShape(document, sourceLabel) {
    if (!document.openapi || typeof document.openapi !== 'string' || !isRecord(document.paths)) {
        throw new ValidationError('INVALID_OPENAPI_DOCUMENT', `OpenAPI document is missing required fields: ${sourceLabel}`, {
            source: sourceLabel,
            required: ['openapi', 'paths'],
        });
    }
}
export function hasEffectiveSecurity(operation, rootSecurity) {
    if (Array.isArray(operation.security)) {
        return operation.security.length > 0;
    }
    return Array.isArray(rootSecurity) && rootSecurity.length > 0;
}
function parseOperationLabel(operationLabel) {
    const firstSpace = operationLabel.indexOf(' ');
    if (firstSpace <= 0 || firstSpace === operationLabel.length - 1) {
        return null;
    }
    return {
        method: operationLabel.slice(0, firstSpace).toLowerCase(),
        routePath: operationLabel.slice(firstSpace + 1),
    };
}
function getLeadingSpaceCount(line) {
    const match = line.match(/^\s*/);
    return match ? match[0].length : 0;
}
function matchesStructuredKey(trimmedLine, key) {
    return trimmedLine === `${key}:`
        || trimmedLine === `'${key}':`
        || trimmedLine === `"${key}":`
        || trimmedLine.startsWith(`${key}: `)
        || trimmedLine.startsWith(`'${key}': `)
        || trimmedLine.startsWith(`"${key}": `);
}
function findYamlOperationLine(content, routePath, method) {
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
function findJsonOperationLine(content, routePath, method) {
    const lines = content.split(/\r?\n/u);
    let pathLine;
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
export function resolveOperationLine(document, operationLabel) {
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
export function getOperations(document) {
    const operations = new Map();
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
function getSchemaObject(schema) {
    return isRecord(schema) ? schema : undefined;
}
function resolveLocalSchemaRef(document, schema, seen = new Set()) {
    const schemaObject = getSchemaObject(schema);
    if (!schemaObject) {
        return undefined;
    }
    const ref = typeof schemaObject.$ref === 'string' ? schemaObject.$ref : undefined;
    if (!ref) {
        return schemaObject;
    }
    const prefix = '#/components/schemas/';
    if (!ref.startsWith(prefix)) {
        return schemaObject;
    }
    const schemaName = ref.slice(prefix.length);
    if (!schemaName || seen.has(schemaName)) {
        return undefined;
    }
    const target = document.components?.schemas?.[schemaName];
    if (!target) {
        return undefined;
    }
    seen.add(schemaName);
    return resolveLocalSchemaRef(document, target, seen) || getSchemaObject(target);
}
function resolveObjectSchema(document, schema) {
    if (!schema) {
        return undefined;
    }
    const resolved = resolveLocalSchemaRef(document, schema) || schema;
    let mergedSchema = resolved;
    const allOf = Array.isArray(resolved.allOf) ? resolved.allOf : [];
    if (allOf.length > 0) {
        const mergedProperties = {};
        const mergedRequired = new Set();
        let mergedAdditionalProperties = undefined;
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
        .filter((subSchema) => !!subSchema && isRecord(subSchema.properties));
    if (resolvedVariants.length === 0) {
        return mergedSchema;
    }
    const directProperties = isRecord(mergedSchema.properties) ? { ...mergedSchema.properties } : {};
    const directRequired = new Set(Array.isArray(mergedSchema.required)
        ? mergedSchema.required.filter((item) => typeof item === 'string')
        : []);
    const [firstVariant, ...restVariants] = resolvedVariants;
    const commonProperties = new Map(Object.entries(firstVariant.properties));
    const commonRequired = new Set(Array.isArray(firstVariant.required)
        ? firstVariant.required.filter((item) => typeof item === 'string')
        : []);
    for (const variant of restVariants) {
        const variantProperties = isRecord(variant.properties) ? variant.properties : {};
        const variantRequired = new Set(Array.isArray(variant.required)
            ? variant.required.filter((item) => typeof item === 'string')
            : []);
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
function inferSchemaType(document, schema) {
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
function inferNullable(document, schema) {
    const schemaObject = resolveObjectSchema(document, getSchemaObject(schema));
    if (!schemaObject) {
        return false;
    }
    if (schemaObject.nullable === true) {
        return true;
    }
    return Array.isArray(schemaObject.type) && schemaObject.type.includes('null');
}
function normalizeEnumValues(values) {
    if (!Array.isArray(values)) {
        return [];
    }
    return values.map((value) => JSON.stringify(value)).sort();
}
function normalizeDefaultValue(value) {
    if (value === undefined) {
        return undefined;
    }
    return JSON.stringify(value);
}
function getComparableDiscriminator(schema) {
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
function getComparableField(document, schema) {
    const schemaObject = resolveObjectSchema(document, getSchemaObject(schema));
    if (!schemaObject) {
        return {
            enumValues: [],
            hasDefault: false,
            nullable: false,
            type: 'object',
        };
    }
    return {
        defaultValue: normalizeDefaultValue(schemaObject.default),
        enumValues: normalizeEnumValues(Array.isArray(schemaObject.enum) ? schemaObject.enum : undefined),
        hasDefault: Object.hasOwn(schemaObject, 'default'),
        nullable: inferNullable(document, schemaObject),
        type: inferSchemaType(document, schemaObject),
    };
}
function getJsonContentSchema(container) {
    if (!isRecord(container) || !isRecord(container.content)) {
        return undefined;
    }
    const contentEntries = Object.entries(container.content).find(([contentType]) => contentType === 'application/json' || contentType.endsWith('+json'));
    if (!contentEntries) {
        return undefined;
    }
    const [, mediaType] = contentEntries;
    if (!isRecord(mediaType)) {
        return undefined;
    }
    return getSchemaObject(mediaType.schema);
}
export function getRequestSchema(operation) {
    return getJsonContentSchema(operation.requestBody);
}
export function getSuccessResponseSchemas(operation) {
    const schemas = new Map();
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
function collectComparableFields(document, schema, pathPrefix, ancestorRequired, properties, discriminators, required) {
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
        const itemSchema = resolveObjectSchema(document, getSchemaObject(resolvedSchema.items));
        if (!itemSchema) {
            properties.set(arrayPath, {
                enumValues: [],
                hasDefault: false,
                nullable: false,
                type: 'object',
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
        const directRequired = new Set(Array.isArray(resolvedSchema.required)
            ? resolvedSchema.required.filter((item) => typeof item === 'string')
            : []);
        for (const [propertyName, propertySchema] of Object.entries(resolvedSchema.properties)) {
            const nextPath = pathPrefix ? `${pathPrefix}.${propertyName}` : propertyName;
            const propertyRequired = ancestorRequired && directRequired.has(propertyName);
            collectComparableFields(document, getSchemaObject(propertySchema), nextPath, propertyRequired, properties, discriminators, required);
        }
        const additionalPropertiesSchema = getSchemaObject(resolvedSchema.additionalProperties);
        if (additionalPropertiesSchema) {
            const wildcardPath = pathPrefix ? `${pathPrefix}.*` : '*';
            collectComparableFields(document, additionalPropertiesSchema, wildcardPath, ancestorRequired, properties, discriminators, required);
        }
        return;
    }
    if (resolvedSchema.type === 'object') {
        const additionalPropertiesSchema = getSchemaObject(resolvedSchema.additionalProperties);
        if (additionalPropertiesSchema) {
            const wildcardPath = pathPrefix ? `${pathPrefix}.*` : '*';
            collectComparableFields(document, additionalPropertiesSchema, wildcardPath, ancestorRequired, properties, discriminators, required);
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
export function getComparableObjectShape(document, schema) {
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
    const comparableProperties = new Map();
    const discriminators = new Map();
    const required = new Set();
    collectComparableFields(document, objectSchema, '', true, comparableProperties, discriminators, required);
    return { discriminators, properties: comparableProperties, required, pathSuffix };
}
export function buildDiscriminatorExcerpt(prefix, pathSuffix, schemaPath, propertyName) {
    const path = schemaPath ? `.${schemaPath}` : '';
    return `${prefix}${pathSuffix}${path}#discriminator.${propertyName}`;
}
