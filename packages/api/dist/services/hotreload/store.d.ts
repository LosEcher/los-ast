/**
 * 热重载存储服务
 * Phase 1.6: 热重载系统
 */
import type { ConfigBundle, CreateConfigBundleRequest, HotReloadStats } from '@los-ast/shared/types';
export declare function createConfigBundle(request: CreateConfigBundleRequest): Promise<ConfigBundle>;
export declare function getConfigBundle(bundleId: string): Promise<ConfigBundle | null>;
export declare function validateConfigBundle(bundleId: string, validatorId: string): Promise<ConfigBundle | null>;
export declare function activateConfigBundle(bundleId: string): Promise<ConfigBundle | null>;
export declare function rollbackConfigBundle(bundleId: string): Promise<ConfigBundle | null>;
export declare function listConfigBundles(): Promise<ConfigBundle[]>;
export declare function getHotReloadStats(): HotReloadStats;
export declare function clearHotReloadStore(): void;
//# sourceMappingURL=store.d.ts.map