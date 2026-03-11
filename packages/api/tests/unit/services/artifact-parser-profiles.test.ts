import { describe, it, expect } from 'vitest';
import { artifactParserProfiles } from '../../../src/services/artifact-parsers/registry.js';

describe('artifact parser profiles', () => {
  it('should expose capability metadata for all parser profiles', () => {
    expect(artifactParserProfiles).toHaveLength(2);

    for (const profile of artifactParserProfiles) {
      expect(profile.id).toBeTruthy();
      expect(profile.capabilities.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(['experimental', 'preview', 'stable']).toContain(profile.capabilities.stability);
      expect(profile.capabilities.acceptedFormats.length).toBeGreaterThan(0);
      expect(profile.capabilities.checks.length).toBeGreaterThan(0);
      expect(profile.capabilities.fixtureFiles.length).toBeGreaterThan(0);
      expect(profile.capabilities.emitsFindingSource).toBe(profile.source);
    }
  });
});
