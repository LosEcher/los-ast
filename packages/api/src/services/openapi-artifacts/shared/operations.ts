/**
 * OpenAPI Artifacts - Operations
 * Extracted from shared.ts for better modularity
 */

import type { OpenApiObject } from './types.js';
import { HTTP_METHODS } from './types.js';
import { isRecord } from './utils.js';

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

export function getRequestSchema(operation: Record<string, unknown>): Record<string, unknown> | undefined {
  const requestBody = operation.requestBody;
  if (!isRecord(requestBody)) {
    return undefined;
  }

  const content = requestBody.content;
  if (!isRecord(content)) {
    return undefined;
  }

  const jsonContent = content['application/json'];
  if (isRecord(jsonContent) && isRecord(jsonContent.schema)) {
    return jsonContent.schema;
  }

  // Try first available content type
  for (const key of Object.keys(content)) {
    const mediaType = content[key];
    if (isRecord(mediaType) && isRecord(mediaType.schema)) {
      return mediaType.schema;
    }
  }

  return undefined;
}

export function getSuccessResponseSchemas(
  operation: Record<string, unknown>
): Map<string, Record<string, unknown>> {
  const result = new Map<string, Record<string, unknown>>();

  const responses = operation.responses;
  if (!isRecord(responses)) {
    return result;
  }

  for (const [statusCode, response] of Object.entries(responses)) {
    if (!isRecord(response)) {
      continue;
    }

    // Only include success responses (2xx)
    const statusNum = parseInt(statusCode, 10);
    if (isNaN(statusNum) || statusNum < 200 || statusNum >= 300) {
      continue;
    }

    const content = response.content;
    if (!isRecord(content)) {
      continue;
    }

    const jsonContent = content['application/json'];
    if (isRecord(jsonContent) && isRecord(jsonContent.schema)) {
      result.set(statusCode, jsonContent.schema);
      continue;
    }

    // Try first available content type
    for (const key of Object.keys(content)) {
      const mediaType = content[key];
      if (isRecord(mediaType) && isRecord(mediaType.schema)) {
        result.set(statusCode, mediaType.schema);
        break;
      }
    }
  }

  return result;
}
