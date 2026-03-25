import { describe, expect, it } from 'vitest';
import {
  SCAN_NATIVE_INPUT_KEYS,
  SCAN_REQUEST_BASE_PROPERTY_KEYS,
  SCAN_REQUEST_PROPERTY_KEYS,
  scanNativeInputProperties,
  scanResponseDataSchema,
  scanResponseSchema,
  scanScopeSchema,
} from '../../../src/routes/core/scan-contract/shared';

describe('scan contract shared schema', () => {
  it('keeps request property keys aligned with exported native-input keys', () => {
    expect(SCAN_REQUEST_BASE_PROPERTY_KEYS).toEqual([
      'scope',
      'project',
      'rootDir',
      'include',
      'ignore',
      'rules',
      'rulePack',
      'includeStats',
      'deterministic',
    ]);
    expect(SCAN_NATIVE_INPUT_KEYS).toEqual([
      'openApiDocuments',
      'openApiComparisons',
      'schemaDocuments',
      'schemaComparisons',
      'contractArtifacts',
      'schemaArtifacts',
    ]);
    expect(SCAN_REQUEST_PROPERTY_KEYS).toEqual([
      ...SCAN_REQUEST_BASE_PROPERTY_KEYS,
      ...SCAN_NATIVE_INPUT_KEYS,
    ]);
  });

  it('keeps scope and native-input schema shapes conservative for generated docs', () => {
    expect(scanScopeSchema.properties.mode.enum).toEqual(['local', 'service']);
    expect(Object.keys(scanNativeInputProperties)).toEqual([...SCAN_NATIVE_INPUT_KEYS]);
    expect(scanNativeInputProperties.openApiComparisons.items.required).toEqual(['baseline', 'current']);
    expect(scanNativeInputProperties.schemaArtifacts.items.properties.impactHint.enum).toEqual([
      'low',
      'medium',
      'high',
    ]);
  });

  it('keeps response schema rooted at data with stable telemetry keys', () => {
    expect(Object.keys(scanResponseSchema.properties)).toEqual(['data']);
    expect(Object.keys(scanResponseDataSchema.properties)).toEqual([
      'filesScanned',
      'findings',
      'parseCache',
      'parseFailures',
      'scanTelemetry',
    ]);
    expect(scanResponseDataSchema.properties.scanTelemetry.properties.mode.enum).toEqual([
      'ast',
      'native_only',
      'hybrid',
    ]);
  });
});
