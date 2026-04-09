/**
 * Config - Types
 * TypeScript type definitions
 */

import { z } from 'zod';
import type { configSchema } from './schemas.js';

export type ConfigInput = z.input<typeof configSchema>;

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ParsedConfig extends z.output<typeof configSchema> {}

export interface ParsedConfigResult {
  values: ParsedConfig;
  errors: string[];
}
