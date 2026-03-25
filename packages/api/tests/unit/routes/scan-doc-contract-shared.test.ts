import { describe, expect, it } from 'vitest';
import {
  SCAN_DETERMINISTIC_REFERENCE,
  SCAN_ENDPOINT_ERROR_REFERENCE,
  SCAN_GOVERNANCE_OVERVIEW,
  SCAN_LIMIT_REFERENCE,
  SCAN_OPENAPI_ERROR_RESPONSES,
  SCAN_OPENAPI_REQUEST_EXAMPLES,
} from '../../../src/routes/core/scan-doc-contract/shared';

describe('scan doc contract shared references', () => {
  it('keeps operational error and limit references aligned with stable contract assumptions', () => {
    expect(SCAN_ENDPOINT_ERROR_REFERENCE.map((entry) => entry.httpStatus)).toEqual([
      400, 400, 400, 401, 403, 404, 404, 408, 413, 500, 500, 503,
    ]);
    expect(SCAN_LIMIT_REFERENCE.map((entry) => entry.name)).toEqual([
      'Max Files (Sync)',
      'Response Size',
      'Timeout',
      'Excerpt Length',
      'Cache Entries',
      'Parse Failure Samples',
    ]);
    expect(SCAN_LIMIT_REFERENCE.every((entry) => entry.value.length > 0)).toBe(true);
  });

  it('keeps governance and deterministic reference tables populated for generated docs', () => {
    expect(SCAN_GOVERNANCE_OVERVIEW.rows).toHaveLength(5);
    expect(SCAN_GOVERNANCE_OVERVIEW.references).toContain('docs/api/ARTIFACT_PARSER_CAPABILITIES.md');
    expect(SCAN_DETERMINISTIC_REFERENCE.rows.map((row) => row.aspect)).toEqual([
      'JSON Keys',
      'Findings Order',
      'Timestamp',
      'Fingerprint',
      'Output',
    ]);
  });

  it('keeps OpenAPI request and error examples conservative and readable', () => {
    expect(SCAN_OPENAPI_REQUEST_EXAMPLES.minimal.value.rootDir).toBe('/path/to/code');
    expect(SCAN_OPENAPI_REQUEST_EXAMPLES.withSchemaArtifacts.value.schemaArtifacts[0]).toMatchObject({
      governanceDomain: 'database',
      impactHint: 'medium',
    });
    expect(SCAN_OPENAPI_ERROR_RESPONSES['503'].examples.coreNotReady.value.error).toMatchObject({
      category: 'SERVICE_UNAVAILABLE',
      code: 'CORE_NOT_READY',
      retryable: true,
    });
  });
});
