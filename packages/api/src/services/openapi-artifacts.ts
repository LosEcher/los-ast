import { parse as parseYaml } from 'yaml';
import type {
  ContractArtifactFindingInput,
  OpenApiComparisonInput,
  OpenApiDocumentInput,
} from '@los-ast/shared/types';
import { ValidationError } from '../types/errors.js';

type OpenApiObject = {
  openapi?: string;
  security?: unknown[];
  paths?: Record<string, Record<string, unknown>>;
};

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);
const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseDocument(document: OpenApiDocumentInput, index: number): OpenApiObject {
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

function ensureOpenApiShape(document: OpenApiObject, sourceLabel: string): void {
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

function hasEffectiveSecurity(operation: Record<string, unknown>, rootSecurity: unknown[] | undefined): boolean {
  if (Array.isArray(operation.security)) {
    return operation.security.length > 0;
  }

  return Array.isArray(rootSecurity) && rootSecurity.length > 0;
}

function buildContractFinding(
  source: string,
  file: string,
  line: number,
  ruleId: string,
  severity: 'info' | 'warning' | 'error',
  message: string,
  excerpt: string,
  governanceDomain: string[],
  impactHint: 'low' | 'medium' | 'high'
): ContractArtifactFindingInput {
  return {
    source,
    ruleId,
    severity,
    message,
    file,
    language: 'contract',
    line,
    column: 0,
    excerpt,
    governanceDomain,
    impactHint,
  };
}

function getOperations(document: OpenApiObject): Map<string, Record<string, unknown>> {
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

function getRequestSchema(operation: Record<string, unknown>): Record<string, unknown> | undefined {
  return getJsonContentSchema(operation.requestBody);
}

function getSuccessResponseSchema(operation: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!isRecord(operation.responses)) {
    return undefined;
  }

  for (const [status, response] of Object.entries(operation.responses)) {
    if (!/^2\d\d$/.test(status) && status !== 'default') {
      continue;
    }

    const schema = getJsonContentSchema(response);
    if (schema) {
      return schema;
    }
  }

  return undefined;
}

function getTopLevelObjectShape(schema: Record<string, unknown> | undefined): {
  properties: Map<string, string>;
  required: Set<string>;
} {
  if (!schema || schema.type !== 'object' || !isRecord(schema.properties)) {
    return {
      properties: new Map(),
      required: new Set(),
    };
  }

  const properties = new Map<string, string>();
  for (const [name, propertySchema] of Object.entries(schema.properties)) {
    if (!isRecord(propertySchema)) {
      continue;
    }

    const propertyType =
      typeof propertySchema.type === 'string'
        ? propertySchema.type
        : Array.isArray(propertySchema.enum)
          ? 'enum'
          : 'object';
    properties.set(name, propertyType);
  }

  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((item): item is string => typeof item === 'string')
      : []
  );

  return { properties, required };
}

export function buildContractArtifactsFromOpenApi(
  documents: OpenApiDocumentInput[] | undefined
): ContractArtifactFindingInput[] {
  if (!Array.isArray(documents) || documents.length === 0) {
    return [];
  }

  const artifacts: ContractArtifactFindingInput[] = [];

  documents.forEach((document, docIndex) => {
    const sourceLabel = document.source || document.file || `openapi-${docIndex + 1}`;
    const fileLabel = document.file || sourceLabel;
    const parsed = parseDocument(document, docIndex);
    ensureOpenApiShape(parsed, sourceLabel);

    let findingLine = 1;

    for (const [routePath, pathItem] of Object.entries(parsed.paths || {})) {
      if (!isRecord(pathItem)) {
        continue;
      }

      for (const [method, operationRaw] of Object.entries(pathItem)) {
        if (!HTTP_METHODS.has(method)) {
          continue;
        }
        if (!isRecord(operationRaw)) {
          continue;
        }

        const operation = operationRaw;
        const methodUpper = method.toUpperCase();
        const operationLabel = `${methodUpper} ${routePath}`;

        if (typeof operation.operationId !== 'string' || operation.operationId.trim().length === 0) {
          artifacts.push(buildContractFinding(
            sourceLabel,
            fileLabel,
            findingLine,
            'contract/openapi-operation-id',
            'warning',
            `OpenAPI operation ${operationLabel} is missing operationId`,
            operationLabel,
            ['interface', 'backend'],
            'medium',
          ));
        }

        if (MUTATING_METHODS.has(method) && !hasEffectiveSecurity(operation, parsed.security)) {
          artifacts.push(buildContractFinding(
            sourceLabel,
            fileLabel,
            findingLine,
            'contract/openapi-auth-required',
            'error',
            `OpenAPI operation ${operationLabel} should declare security requirements`,
            operationLabel,
            ['backend', 'interface'],
            'high',
          ));
        }

        const responses = operation.responses;
        const hasSuccessResponse = isRecord(responses)
          && Object.keys(responses).some((status) => /^2\d\d$/.test(status) || status === 'default');

        if (!hasSuccessResponse) {
          artifacts.push(buildContractFinding(
            sourceLabel,
            fileLabel,
            findingLine,
            'contract/openapi-success-response',
            'warning',
            `OpenAPI operation ${operationLabel} should declare at least one success response`,
            operationLabel,
            ['interface'],
            'medium',
          ));
        }

        findingLine += 1;
      }
    }
  });

  return artifacts;
}

export function buildContractArtifactsFromOpenApiComparisons(
  comparisons: OpenApiComparisonInput[] | undefined
): ContractArtifactFindingInput[] {
  if (!Array.isArray(comparisons) || comparisons.length === 0) {
    return [];
  }

  const artifacts: ContractArtifactFindingInput[] = [];

  comparisons.forEach((comparison, index) => {
    const sourceLabel = comparison.source || comparison.file || `openapi-comparison-${index + 1}`;
    const fileLabel = comparison.file || sourceLabel;
    const baseline = parseDocument(
      { source: `${sourceLabel}:baseline`, file: comparison.file, content: comparison.baseline, format: comparison.format },
      index
    );
    const current = parseDocument(
      { source: `${sourceLabel}:current`, file: comparison.file, content: comparison.current, format: comparison.format },
      index
    );

    ensureOpenApiShape(baseline, sourceLabel);
    ensureOpenApiShape(current, sourceLabel);

    const baselineOperations = getOperations(baseline);
    const currentOperations = getOperations(current);
    let findingLine = 1;

    for (const [operationLabel, baselineOperation] of baselineOperations.entries()) {
      const currentOperation = currentOperations.get(operationLabel);
      if (!currentOperation) {
        findingLine += 1;
        continue;
      }

      const baselineRequestShape = getTopLevelObjectShape(getRequestSchema(baselineOperation));
      const currentRequestShape = getTopLevelObjectShape(getRequestSchema(currentOperation));
      for (const requiredField of currentRequestShape.required) {
        if (!baselineRequestShape.required.has(requiredField)) {
          artifacts.push(buildContractFinding(
            sourceLabel,
            fileLabel,
            findingLine,
            'contract/openapi-breaking-request-required-add',
            'error',
            `OpenAPI operation ${operationLabel} added required request field ${requiredField}`,
            `${operationLabel} request.${requiredField}`,
            ['interface', 'backend'],
            'high',
          ));
        }
      }

      const baselineResponseShape = getTopLevelObjectShape(getSuccessResponseSchema(baselineOperation));
      const currentResponseShape = getTopLevelObjectShape(getSuccessResponseSchema(currentOperation));
      for (const [fieldName, baselineType] of baselineResponseShape.properties.entries()) {
        const currentType = currentResponseShape.properties.get(fieldName);
        if (!currentType) {
          artifacts.push(buildContractFinding(
            sourceLabel,
            fileLabel,
            findingLine,
            'contract/openapi-breaking-response-field-drop',
            'error',
            `OpenAPI operation ${operationLabel} removed response field ${fieldName}`,
            `${operationLabel} response.${fieldName}`,
            ['interface', 'backend'],
            'high',
          ));
          continue;
        }

        if (baselineType !== currentType) {
          artifacts.push(buildContractFinding(
            sourceLabel,
            fileLabel,
            findingLine,
            'contract/openapi-breaking-response-field-type-change',
            'error',
            `OpenAPI operation ${operationLabel} changed response field ${fieldName} type from ${baselineType} to ${currentType}`,
            `${operationLabel} response.${fieldName}: ${baselineType} -> ${currentType}`,
            ['interface', 'backend'],
            'high',
          ));
        }
      }

      findingLine += 1;
    }
  });

  return artifacts;
}
