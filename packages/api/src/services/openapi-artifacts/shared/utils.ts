/**
 * OpenAPI Artifacts - Utilities
 * Extracted from shared.ts for better modularity
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function hasEffectiveSecurity(operation: Record<string, unknown>, rootSecurity: unknown[] | undefined): boolean {
  if (Array.isArray(operation.security)) {
    return operation.security.length > 0;
  }

  return Array.isArray(rootSecurity) && rootSecurity.length > 0;
}

export function getSchemaObject(schema: unknown): Record<string, unknown> | undefined {
  return isRecord(schema) ? schema : undefined;
}

export function decodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function getLeadingSpaceCount(line: string): number {
  const match = line.match(/^\s*/);
  return match ? match[0].length : 0;
}

export function matchesStructuredKey(trimmedLine: string, key: string): boolean {
  return trimmedLine === `${key}:`
    || trimmedLine === `'${key}':`
    || trimmedLine === `"${key}":`
    || trimmedLine.startsWith(`${key}: `)
    || trimmedLine.startsWith(`'${key}': `)
    || trimmedLine.startsWith(`"${key}": `);
}

export function parseOperationLabel(operationLabel: string): { method: string; routePath: string } | null {
  const firstSpace = operationLabel.indexOf(' ');
  if (firstSpace <= 0 || firstSpace === operationLabel.length - 1) {
    return null;
  }

  return {
    method: operationLabel.slice(0, firstSpace).toLowerCase(),
    routePath: operationLabel.slice(firstSpace + 1),
  };
}
