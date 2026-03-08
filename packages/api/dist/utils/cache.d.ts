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
export declare class MemoryCache<T = unknown> {
    private cache;
    private options;
    constructor(options?: Partial<CacheOptions>);
    /**
     * 获取缓存值
     */
    get(key: string): T | undefined;
    /**
     * 设置缓存值
     */
    set(key: string, value: T, ttl?: number): void;
    /**
     * 删除缓存值
     */
    delete(key: string): void;
    /**
     * 清空缓存
     */
    clear(): void;
    /**
     * 获取缓存统计
     */
    getStats(): {
        size: number;
        maxSize: number;
        hitRate: number;
        enabled: boolean;
    };
    /**
     * 检查键是否存在且未过期
     */
    has(key: string): boolean;
}
/**
 * 全局缓存实例
 */
export declare const globalCache: MemoryCache<unknown>;
/**
 * 缓存装饰器
 * 用于自动缓存函数结果
 */
export declare function withCache<TArgs extends unknown[], TReturn>(fn: (...args: TArgs) => Promise<TReturn>, keyGenerator: (...args: TArgs) => string, ttl?: number): (...args: TArgs) => Promise<TReturn>;
/**
 * 路由缓存中间件
 * 用于 Fastify 路由的缓存装饰
 */
export declare function createRouteCache(options?: Partial<CacheOptions>): {
    /**
     * 获取或设置缓存
     */
    getOrSet<T>(key: string, fetcher: () => Promise<T>, ttl?: number): Promise<T>;
    /**
     * 清除特定前缀的缓存
     */
    invalidatePrefix(prefix: string): void;
    /**
     * 获取缓存统计
     */
    getStats(): {
        size: number;
        maxSize: number;
        hitRate: number;
        enabled: boolean;
    };
    /**
     * 清空缓存
     */
    clear(): void;
};
//# sourceMappingURL=cache.d.ts.map