import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SCAN_NATIVE_INPUT_KEYS,
  SCAN_REQUEST_BASE_PROPERTY_KEYS,
  SCAN_REQUEST_PROPERTY_KEYS,
  scanResponseDataSchema,
} from '../src/routes/core/scan-contract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(__dirname, '../docs/api/generated/scan-contract-reference.json');
const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');

const payload = {
  version: 1,
  sourceOfTruth: [
    'packages/api/src/routes/core/scan-contract.ts',
    'packages/api/src/routes/core/scan-schema.ts',
    'packages/shared/src/types/api.ts',
  ],
  request: {
    required: ['project'],
    baseProperties: [...SCAN_REQUEST_BASE_PROPERTY_KEYS],
    nativeInputProperties: [...SCAN_NATIVE_INPUT_KEYS],
    allProperties: [...SCAN_REQUEST_PROPERTY_KEYS],
    notes: {
      scopeOptional: true,
      rootDirConditional: true,
      deterministicDefault: false,
    },
  },
  response: {
    rootProperties: ['data'],
    dataProperties: Object.keys(scanResponseDataSchema.properties),
  },
} as const;

const serialized = `${JSON.stringify(payload, null, 2)}\n`;

if (checkOnly) {
  const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : null;
  if (existing !== serialized) {
    console.error(`[scan-contract] Reference drift detected: ${path.relative(process.cwd(), outputPath)}`);
    console.error('[scan-contract] Run `npm --prefix packages/api run generate:scan-contract-reference` to update it.');
    process.exit(1);
  }

  console.log(`[scan-contract] Reference is up to date: ${path.relative(process.cwd(), outputPath)}`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, serialized, 'utf8');
console.log(`[scan-contract] Wrote ${path.relative(process.cwd(), outputPath)}`);
