import { describe, expect, it } from 'vitest';

import { ValidationError } from '../../../src/types/errors.js';
import {
  BUILT_IN_RULE_PACK_NAMES,
  hasNativeArtifactInputs,
  requiresCodeScan,
  resolveRulePackPatterns,
  validateScanRequestBody,
} from '../../../src/routes/core/scan/shared.js';

describe('scan route shared helpers', () => {
  it('detects native-only requests and code-scan triggers conservatively', () => {
    expect(hasNativeArtifactInputs({
      project: 'demo',
      openApiDocuments: [{ content: 'openapi: 3.0.0' }],
    })).toBe(true);
    expect(hasNativeArtifactInputs({ project: 'demo' })).toBe(false);

    expect(requiresCodeScan({ project: 'demo' })).toBe(false);
    expect(requiresCodeScan({ project: 'demo', rootDir: '/tmp/project' })).toBe(true);
    expect(requiresCodeScan({ project: 'demo' }, ['/tmp/rules/pack/**/*.yml'])).toBe(true);
  });

  it('resolves built-in rule pack patterns without touching the filesystem in tests', () => {
    expect(BUILT_IN_RULE_PACK_NAMES).toContain('lsclaw-governance');
    expect(resolveRulePackPatterns('lsclaw-governance', '/tmp/rules')).toEqual([
      '/tmp/rules/projects/lsclaw-governance/**/*.yml',
    ]);
    expect(resolveRulePackPatterns(undefined, '/tmp/rules')).toBeUndefined();
  });

  it('validates scan request body boundaries with the same stable error codes', () => {
    expect(() => validateScanRequestBody({ project: 'demo', openApiDocuments: [{ content: 'openapi: 3.0.0' }] })).not.toThrow();

    expect(() => validateScanRequestBody({ project: '' })).toThrowError(ValidationError);
    expect(getValidationErrorCode(() => validateScanRequestBody({ project: 'demo' }))).toBe('INVALID_SCAN_INPUT');
    expect(getValidationErrorCode(() => validateScanRequestBody({ project: 'demo' }, ['/tmp/rules/pack/**/*.yml']))).toBe('INVALID_ROOTDIR');
  });
});

function getValidationErrorCode(callback: () => void) {
  try {
    callback();
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return (error as ValidationError).code;
  }

  throw new Error('Expected ValidationError to be thrown');
}
