/**
 * 热重载存储服务
 * Phase 1.6: 热重载系统
 */

import type {
  ConfigBundle,
  CreateConfigBundleRequest,
  HotReloadStats,
} from '@los-ast/shared/types';
import { generateId } from '../../utils/id-generator.js';

const bundleStore: Map<string, ConfigBundle> = new Map();

export async function createConfigBundle(request: CreateConfigBundleRequest): Promise<ConfigBundle> {
  const now = new Date().toISOString();
  const bundleId = generateId('cfg');

  const bundle: ConfigBundle = {
    bundle_id: bundleId,
    version: request.version,
    scope: request.scope,
    configs: request.configs,
    status: 'draft',
    validation: {
      checksum: generateChecksum(request),
      validated_by: [],
    },
    created_at: now,
    updated_at: now,
  };

  bundleStore.set(bundleId, bundle);
  console.log(`[HotReload] Created config bundle ${bundleId}: ${bundle.version}`);

  return bundle;
}

export async function getConfigBundle(bundleId: string): Promise<ConfigBundle | null> {
  return bundleStore.get(bundleId) || null;
}

export async function validateConfigBundle(bundleId: string, validatorId: string): Promise<ConfigBundle | null> {
  const bundle = bundleStore.get(bundleId);
  if (!bundle) return null;

  bundle.validation.validated_by.push(validatorId);
  bundle.status = 'validated';
  bundle.updated_at = new Date().toISOString();

  bundleStore.set(bundleId, bundle);
  console.log(`[HotReload] Validated config bundle ${bundleId}`);

  return bundle;
}

export async function activateConfigBundle(bundleId: string): Promise<ConfigBundle | null> {
  const bundle = bundleStore.get(bundleId);
  if (!bundle) return null;

  bundle.status = 'active';
  bundle.updated_at = new Date().toISOString();

  bundleStore.set(bundleId, bundle);
  console.log(`[HotReload] Activated config bundle ${bundleId}`);

  return bundle;
}

export async function rollbackConfigBundle(bundleId: string): Promise<ConfigBundle | null> {
  const bundle = bundleStore.get(bundleId);
  if (!bundle) return null;

  bundle.status = 'rollback';
  bundle.updated_at = new Date().toISOString();

  bundleStore.set(bundleId, bundle);
  console.log(`[HotReload] Rolled back config bundle ${bundleId}`);

  return bundle;
}

export async function listConfigBundles(): Promise<ConfigBundle[]> {
  return Array.from(bundleStore.values());
}

export function getHotReloadStats(): HotReloadStats {
  const by_status: Record<string, number> = {};
  let active_bundles = 0;

  for (const bundle of bundleStore.values()) {
    by_status[bundle.status] = (by_status[bundle.status] || 0) + 1;
    if (bundle.status === 'active') active_bundles++;
  }

  return {
    total_bundles: bundleStore.size,
    active_bundles,
    by_status,
  };
}

function generateChecksum(request: CreateConfigBundleRequest): string {
  return Buffer.from(JSON.stringify(request.configs)).toString('base64').substring(0, 16);
}

export function clearHotReloadStore(): void {
  bundleStore.clear();
}
