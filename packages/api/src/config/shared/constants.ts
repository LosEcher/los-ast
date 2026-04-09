/**
 * Config - Constants
 * Default configuration values
 */

import type { ScanLimits } from '../../types/index.js';
import type { ParsedConfig } from './types.js';
import { configSchema } from './schemas.js';

export const CONFIG_WITH_DEFAULTS: ParsedConfig = configSchema.parse({
  PORT: '3000',
  MAX_FILES_PER_SYNC_SCAN: '1000',
  MAX_RESPONSE_BYTES: '10485760',
  MAX_SCAN_DURATION_MS: '30000',
});

export const DEFAULT_SCAN_LIMITS: ScanLimits = {
  maxFilesPerSyncScan: Number(CONFIG_WITH_DEFAULTS.MAX_FILES_PER_SYNC_SCAN),
  maxResponseBytes: Number(CONFIG_WITH_DEFAULTS.MAX_RESPONSE_BYTES),
  maxDurationMs: Number(CONFIG_WITH_DEFAULTS.MAX_SCAN_DURATION_MS),
};
