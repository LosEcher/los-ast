/**
 * Simple In-Memory Cache Utility
 * 简单内存缓存工具
 *
 * 为路由提供短期内存缓存，适用于统计接口等读多写少的场景
 */

export interface CacheEntry<T> {
  value: T;
  expiry: number;
}

export interface CacheOptions {
  /** 默认 TTL (毫秒) */
  defaultTtl: number;
  /** 最大缓存条目数 */
  maxSize: number;
  /** 是否启用缓存 */
  enabled: boolean;
}

export interface CacheStats {
  size: number;
  maxSize: number;
  hitRate: number;
  enabled: boolean;
}

/**
 * 内存缓存类
 */
export class MemoryCache<T = unknown> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private options: CacheOptions;

  constructor(options: Partial<CacheOptions> = {}) {
    this.options = {
      defaultTtl: 30000, // 默认 30 秒
      maxSize: 100,      // 默认最大 100 条
      enabled: true,
      ...options,
    };
  }

  /**
   * 获取缓存值
   */
  get(key: string): T | undefined {
    if (!this.options.enabled) {
      return undefined;
    }

    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    // 检查是否过期
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * 设置缓存值
   */
  set(key: string, value: T, ttl?: number): void {
    if (!this.options.enabled) {
      return;
    }

    // 如果缓存已满，删除最旧的条目
    if (this.cache.size >= this.options.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value as string | undefined;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    const expiry = Date.now() + (ttl ?? this.options.defaultTtl);
    this.cache.set(key, { value, expiry });
  }

  /**
   * 删除缓存值
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存统计
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    enabled: boolean;
  } {
    return {
      size: this.cache.size,
      maxSize: this.options.maxSize,
      hitRate: 0, // 可以扩展添加命中率统计
      enabled: this.options.enabled,
    };
  }

  /**
   * 检查键是否存在且未过期
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }
}

/**
 * 全局缓存实例
 */
export const globalCache = new MemoryCache({
  defaultTtl: 30000, // 30 秒
  maxSize: 100,
  enabled: process.env.DISABLE_CACHE !== 'true',
});

/**
 * 缓存装饰器
 * 用于自动缓存函数结果
 */
export function withCache<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  keyGenerator: (...args: TArgs) => string,
  ttl?: number
): (...args: TArgs) => Promise<TReturn> {
  const cache = new MemoryCache<TReturn>();

  return async (...args: TArgs): Promise<TReturn> => {
    const key = keyGenerator(...args);
    const cached = cache.get(key);

    if (cached !== undefined) {
      return cached;
    }

    const result = await fn(...args);
    cache.set(key, result, ttl);
    return result;
  };
}

/**
 * 路由缓存中间件
 * 用于 Fastify 路由的缓存装饰
 */
export function createRouteCache(options: Partial<CacheOptions> = {}) {
  const cache = new MemoryCache(options);

  return {
    /**
     * 获取或设置缓存
     */
    async getOrSet<T>(key: string, fetcher: () => Promise<T>, ttl?: number): Promise<T> {
      const cached = cache.get(key);
      if (cached !== undefined) {
        return cached as T;
      }

      const result = await fetcher();
      cache.set(key, result, ttl);
      return result;
    },

    /**
     * 清除特定前缀的缓存
     */
    invalidatePrefix(prefix: string): void {
      for (const key of cache['cache'].keys()) {
        if (key.startsWith(prefix)) {
          cache.delete(key);
        }
      }
    },

    /**
     * 获取缓存统计
     */
    getStats() {
      return cache.getStats();
    },

    /**
     * 清空缓存
     */
    clear() {
      cache.clear();
    },
  };
}
