/**
 * Config - Constants
 * Default configuration values
 */
import { configSchema } from './schemas.js';
export const CONFIG_WITH_DEFAULTS = configSchema.parse({
    PORT: '3000',
    MAX_FILES_PER_SYNC_SCAN: '1000',
    MAX_RESPONSE_BYTES: '10485760',
    MAX_SCAN_DURATION_MS: '30000',
});
export const DEFAULT_SCAN_LIMITS = {
    maxFilesPerSyncScan: Number(CONFIG_WITH_DEFAULTS.MAX_FILES_PER_SYNC_SCAN),
    maxResponseBytes: Number(CONFIG_WITH_DEFAULTS.MAX_RESPONSE_BYTES),
    maxDurationMs: Number(CONFIG_WITH_DEFAULTS.MAX_SCAN_DURATION_MS),
};
// Chunked scan configuration
export const CHUNK_CONFIG = {
    /** Max files per chunk (cost-weighted bin-packing soft limit) */
    maxFilesPerChunk: 500,
    /** Max cost-weighted bytes per chunk (50 MB equivalent) */
    maxChunkCostBytes: 52_428_800,
    /** Max concurrent chunk workers */
    maxParallelChunks: 4,
    /** Auto-promote to chunked mode for large projects */
    enableAutoChunking: true,
};
