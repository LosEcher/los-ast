/**
 * Cache Utility Unit Tests
 * P0: Core utility test coverage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryCache, withCache, createRouteCache } from '../../../src/utils/cache';

describe('MemoryCache', () => {
  let cache: MemoryCache<string>;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new MemoryCache({ defaultTtl: 1000, maxSize: 3, enabled: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic operations', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should delete values', () => {
      cache.set('key1', 'value1');
      cache.delete('key1');
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should clear all values', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
    });
  });

  describe('TTL expiration', () => {
    it('should return undefined for expired entries', () => {
      cache.set('key1', 'value1', 10); // 10ms TTL
      expect(cache.get('key1')).toBe('value1');
      
      vi.advanceTimersByTime(20);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should use default TTL when not specified', () => {
      const shortCache = new MemoryCache({ defaultTtl: 50, maxSize: 10 });
      shortCache.set('key1', 'value1');
      expect(shortCache.get('key1')).toBe('value1');
    });

    it('should delete expired entry on access', () => {
      cache.set('key1', 'value1', 10);
      vi.advanceTimersByTime(20);
      cache.get('key1'); // Access expired entry
      expect(cache.has('key1')).toBe(false);
    });
  });

  describe('max size eviction', () => {
    it('should evict oldest entry when max size reached', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4'); // Should evict key1

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });

    it('should not evict when updating existing key', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key1', 'updated'); // Update existing key

      expect(cache.get('key1')).toBe('updated');
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
    });
  });

  describe('disabled cache', () => {
    it('should not store values when disabled', () => {
      const disabledCache = new MemoryCache({ enabled: false, maxSize: 10 });
      disabledCache.set('key1', 'value1');
      expect(disabledCache.get('key1')).toBeUndefined();
    });

    it('should not return values when disabled', () => {
      const enabledCache = new MemoryCache({ enabled: true, maxSize: 10 });
      enabledCache.set('key1', 'value1');
      
      const disabledCache = new MemoryCache({ enabled: false, maxSize: 10 });
      disabledCache['cache'] = enabledCache['cache']; // Share underlying map
      
      expect(disabledCache.get('key1')).toBeUndefined();
    });
  });

  describe('stats', () => {
    it('should return correct stats', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(3);
      expect(stats.enabled).toBe(true);
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('has method', () => {
    it('should return true for existing non-expired key', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
    });

    it('should return false for non-existent key', () => {
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should return false and delete expired key', () => {
      cache.set('key1', 'value1', 10);
      vi.advanceTimersByTime(20);
      expect(cache.has('key1')).toBe(false);
    });
  });
});

describe('withCache decorator', () => {
  it('should cache function results', async () => {
    let callCount = 0;
    const fn = async (x: number) => {
      callCount++;
      return x * 2;
    };

    const cachedFn = withCache(fn, (x) => `key-${x}`, 1000);

    const result1 = await cachedFn(5);
    const result2 = await cachedFn(5);

    expect(result1).toBe(10);
    expect(result2).toBe(10);
    expect(callCount).toBe(1); // Function called only once
  });

  it('should use different keys for different arguments', async () => {
    let callCount = 0;
    const fn = async (x: number) => {
      callCount++;
      return x * 2;
    };

    const cachedFn = withCache(fn, (x) => `key-${x}`, 1000);

    await cachedFn(5);
    await cachedFn(10);

    expect(callCount).toBe(2);
  });
});

describe('createRouteCache', () => {
  let routeCache: ReturnType<typeof createRouteCache>;

  beforeEach(() => {
    routeCache = createRouteCache({ defaultTtl: 1000, maxSize: 10 });
  });

  describe('getOrSet', () => {
    it('should fetch and cache value on first call', async () => {
      let fetchCount = 0;
      const fetcher = async () => {
        fetchCount++;
        return 'fetched-value';
      };

      const result1 = await routeCache.getOrSet('key1', fetcher);
      const result2 = await routeCache.getOrSet('key1', fetcher);

      expect(result1).toBe('fetched-value');
      expect(result2).toBe('fetched-value');
      expect(fetchCount).toBe(1);
    });

    it('should call fetcher again for different keys', async () => {
      let fetchCount = 0;
      const fetcher = async () => {
        fetchCount++;
        return 'value';
      };

      await routeCache.getOrSet('key1', fetcher);
      await routeCache.getOrSet('key2', fetcher);

      expect(fetchCount).toBe(2);
    });
  });

  describe('invalidatePrefix', () => {
    it('should invalidate keys with matching prefix', async () => {
      await routeCache.getOrSet('prefix-key1', async () => 'value1');
      await routeCache.getOrSet('prefix-key2', async () => 'value2');
      await routeCache.getOrSet('other-key', async () => 'value3');

      routeCache.invalidatePrefix('prefix-');

      let fetchCount = 0;
      const fetcher = async () => {
        fetchCount++;
        return 'new-value';
      };

      await routeCache.getOrSet('prefix-key1', fetcher);
      expect(fetchCount).toBe(1); // Had to fetch again
    });
  });

  describe('getStats and clear', () => {
    it('should return stats', async () => {
      await routeCache.getOrSet('key1', async () => 'value1');
      
      const stats = routeCache.getStats();
      expect(stats.size).toBe(1);
    });

    it('should clear all entries', async () => {
      await routeCache.getOrSet('key1', async () => 'value1');
      routeCache.clear();
      
      const stats = routeCache.getStats();
      expect(stats.size).toBe(0);
    });
  });
});
