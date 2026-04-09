/**
 * ID Generator Unit Tests
 * P0: Core utility test coverage
 */

import { describe, it, expect } from 'vitest';
import { generateId, generateUUID } from '../../../src/utils/id-generator';

describe('ID Generator', () => {
  describe('generateId', () => {
    it('should generate ID with correct prefix for all supported types', () => {
      const types = ['inc', 'hyp', 'act', 'rec', 'cfg', 'evd', 'fct', 'ana'] as const;
      
      for (const type of types) {
        const id = generateId(type);
        expect(id).toMatch(new RegExp(`^${type}_[a-z0-9]+_[a-z0-9]+$`));
      }
    });

    it('should generate unique IDs on multiple calls', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId('inc'));
      }
      expect(ids.size).toBe(100);
    });

    it('should use "unk" prefix for unknown types', () => {
      // @ts-expect-error Testing invalid type
      const id = generateId('unknown');
      expect(id).toMatch(/^unk_[a-z0-9]+_[a-z0-9]+$/);
    });

    it('should include timestamp component', () => {
      const before = Date.now();
      const id = generateId('inc');
      const after = Date.now();
      
      const parts = id.split('_');
      expect(parts.length).toBe(3);
      
      const timestamp = parseInt(parts[1], 36);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('should include random component of expected length', () => {
      const id = generateId('inc');
      const parts = id.split('_');
      expect(parts[2].length).toBe(6);
    });
  });

  describe('generateUUID', () => {
    it('should generate valid UUID v4 format', () => {
      const uuid = generateUUID();
      expect(uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    });

    it('should generate unique UUIDs on multiple calls', () => {
      const uuids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        uuids.add(generateUUID());
      }
      expect(uuids.size).toBe(100);
    });

    it('should have correct version bits (4)', () => {
      for (let i = 0; i < 10; i++) {
        const uuid = generateUUID();
        const versionChar = uuid.charAt(14);
        expect(versionChar).toBe('4');
      }
    });

    it('should have correct variant bits (8, 9, a, or b)', () => {
      for (let i = 0; i < 10; i++) {
        const uuid = generateUUID();
        const variantChar = uuid.charAt(19);
        expect(['8', '9', 'a', 'b']).toContain(variantChar);
      }
    });
  });
});
