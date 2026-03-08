/**
 * 热重载存储服务
 * Phase 1.6: 热重载系统
 */
import { generateId } from '../../utils/id-generator.js';
const bundleStore = new Map();
export async function createConfigBundle(request) {
    const now = new Date().toISOString();
    const bundleId = generateId('cfg');
    const bundle = {
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
export async function getConfigBundle(bundleId) {
    return bundleStore.get(bundleId) || null;
}
export async function validateConfigBundle(bundleId, validatorId) {
    const bundle = bundleStore.get(bundleId);
    if (!bundle)
        return null;
    bundle.validation.validated_by.push(validatorId);
    bundle.status = 'validated';
    bundle.updated_at = new Date().toISOString();
    bundleStore.set(bundleId, bundle);
    console.log(`[HotReload] Validated config bundle ${bundleId}`);
    return bundle;
}
export async function activateConfigBundle(bundleId) {
    const bundle = bundleStore.get(bundleId);
    if (!bundle)
        return null;
    bundle.status = 'active';
    bundle.updated_at = new Date().toISOString();
    bundleStore.set(bundleId, bundle);
    console.log(`[HotReload] Activated config bundle ${bundleId}`);
    return bundle;
}
export async function rollbackConfigBundle(bundleId) {
    const bundle = bundleStore.get(bundleId);
    if (!bundle)
        return null;
    bundle.status = 'rollback';
    bundle.updated_at = new Date().toISOString();
    bundleStore.set(bundleId, bundle);
    console.log(`[HotReload] Rolled back config bundle ${bundleId}`);
    return bundle;
}
export async function listConfigBundles() {
    return Array.from(bundleStore.values());
}
export function getHotReloadStats() {
    const by_status = {};
    let active_bundles = 0;
    for (const bundle of bundleStore.values()) {
        by_status[bundle.status] = (by_status[bundle.status] || 0) + 1;
        if (bundle.status === 'active')
            active_bundles++;
    }
    return {
        total_bundles: bundleStore.size,
        active_bundles,
        by_status,
    };
}
function generateChecksum(request) {
    return Buffer.from(JSON.stringify(request.configs)).toString('base64').substring(0, 16);
}
export function clearHotReloadStore() {
    bundleStore.clear();
}
//# sourceMappingURL=store.js.map