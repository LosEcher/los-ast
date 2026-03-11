import { parse as parseYaml } from 'yaml';
import type { ContractArtifactFindingInput, OpenApiDocumentInput } from '@los-ast/shared/types';
import { ValidationError } from '../types/errors.js';

type OpenApiObject = {
  openapi?: string;
  security?: unknown[];
  paths?: Record<string, Record<string, Record<string, unknown>>>;
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
          artifacts.push({
            source: sourceLabel,
            ruleId: 'contract/openapi-operation-id',
            severity: 'warning',
            message: `OpenAPI operation ${operationLabel} is missing operationId`,
            file: fileLabel,
            language: 'contract',
            line: findingLine,
            column: 0,
            excerpt: operationLabel,
            governanceDomain: ['interface', 'backend'],
            impactHint: 'medium',
          });
        }

        if (MUTATING_METHODS.has(method) && !hasEffectiveSecurity(operation, parsed.security)) {
          artifacts.push({
            source: sourceLabel,
            ruleId: 'contract/openapi-auth-required',
            severity: 'error',
            message: `OpenAPI operation ${operationLabel} should declare security requirements`,
            file: fileLabel,
            language: 'contract',
            line: findingLine,
            column: 0,
            excerpt: operationLabel,
            governanceDomain: ['backend', 'interface'],
            impactHint: 'high',
          });
        }

        const responses = operation.responses;
        const hasSuccessResponse = isRecord(responses)
          && Object.keys(responses).some((status) => /^2\d\d$/.test(status) || status === 'default');

        if (!hasSuccessResponse) {
          artifacts.push({
            source: sourceLabel,
            ruleId: 'contract/openapi-success-response',
            severity: 'warning',
            message: `OpenAPI operation ${operationLabel} should declare at least one success response`,
            file: fileLabel,
            language: 'contract',
            line: findingLine,
            column: 0,
            excerpt: operationLabel,
            governanceDomain: ['interface'],
            impactHint: 'medium',
          });
        }

        findingLine += 1;
      }
    }
  });

  return artifacts;
}
