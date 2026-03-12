import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SCAN_ENDPOINT_ERROR_REFERENCE,
  SCAN_ERROR_CATEGORY_VALUES,
  SCAN_LIMIT_REFERENCE,
} from '../src/routes/core/scan-doc-contract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const apiContractPath = path.join(repoRoot, 'packages/api/docs/api/API_CONTRACT.md');
const generatedPath = path.join(repoRoot, 'packages/api/docs/api/generated/scan-api-contract-operational-sections.md');
const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');

const generatedSections = buildGeneratedSections();

if (!checkOnly) {
  fs.mkdirSync(path.dirname(generatedPath), { recursive: true });
  fs.writeFileSync(generatedPath, `${generatedSections}\n`, 'utf8');
}

const currentApiContract = fs.readFileSync(apiContractPath, 'utf8');
const nextApiContract = replaceGeneratedSections(currentApiContract, generatedSections);

if (checkOnly) {
  const currentGenerated = fs.existsSync(generatedPath) ? fs.readFileSync(generatedPath, 'utf8') : null;
  if (currentGenerated !== `${generatedSections}\n`) {
    console.error(`[scan-api-contract-ops] Generated section drift detected: ${path.relative(repoRoot, generatedPath)}`);
    console.error('[scan-api-contract-ops] Run `npm --prefix packages/api run generate:scan-api-contract-operational-sections` to refresh it.');
    process.exit(1);
  }

  if (currentApiContract !== nextApiContract) {
    console.error(`[scan-api-contract-ops] Embedded API contract section drift detected: ${path.relative(repoRoot, apiContractPath)}`);
    console.error('[scan-api-contract-ops] Run `npm --prefix packages/api run generate:scan-api-contract-operational-sections` to sync it.');
    process.exit(1);
  }

  console.log('[scan-api-contract-ops] API_CONTRACT operational sections are up to date.');
  process.exit(0);
}

fs.writeFileSync(apiContractPath, nextApiContract, 'utf8');
console.log(`[scan-api-contract-ops] Wrote ${path.relative(repoRoot, generatedPath)}`);
console.log(`[scan-api-contract-ops] Synced ${path.relative(repoRoot, apiContractPath)}`);

function buildGeneratedSections(): string {
  const errorCategories = [
    'type ErrorCategory =',
    ...SCAN_ERROR_CATEGORY_VALUES.map((value, index) => {
      const suffix = index === SCAN_ERROR_CATEGORY_VALUES.length - 1 ? ';' : '';
      return `  | '${value}'${suffix}`;
    }),
  ].join('\n');

  const errorTable = [
    '| HTTP Status | Category | Code | Description |',
    '|-------------|----------|------|-------------|',
    ...SCAN_ENDPOINT_ERROR_REFERENCE.map((entry) =>
      `| ${entry.httpStatus} | ${entry.category} | \`${entry.code}\` | ${entry.description} |`
    ),
  ].join('\n');

  const limitsTable = [
    '| Constraint | Value | Description |',
    '|------------|-------|-------------|',
    ...SCAN_LIMIT_REFERENCE.map((entry) => `| ${entry.name} | ${entry.value} | ${entry.description} |`),
  ].join('\n');

  return [
    '<!-- @generated scan-api-contract-ops:begin -->',
    errorCategories,
    '',
    '### Error Code Reference',
    '',
    errorTable,
    '',
    'Authentication note: when the identity plugin is enforced, `/scan` may also surface additional `401 AUTHENTICATION` codes from JWT or local identity verification.',
    '',
    '## Limits and Constraints',
    '',
    limitsTable,
    '<!-- @generated scan-api-contract-ops:end -->',
  ].join('\n');
}

function replaceGeneratedSections(source: string, generated: string): string {
  const markerPattern = /<!-- @generated scan-api-contract-ops:begin -->[\s\S]*<!-- @generated scan-api-contract-ops:end -->/m;
  if (markerPattern.test(source)) {
    return source.replace(markerPattern, generated);
  }

  const typeStart = source.indexOf('type ErrorCategory =');
  const readinessStart = source.indexOf('### Readiness & Explicit Degradation Contract');
  const limitsStart = source.indexOf('## Limits and Constraints');
  const governanceStart = source.indexOf('## Governance Scope Note');
  if (typeStart === -1 || readinessStart === -1 || limitsStart === -1 || governanceStart === -1) {
    throw new Error(`Unable to locate ErrorCategory/Limits sections in ${apiContractPath}`);
  }

  const beforeErrors = source.slice(0, typeStart);
  const between = source.slice(readinessStart, limitsStart);
  const afterLimits = source.slice(governanceStart);
  return `${beforeErrors}${generated}\n\n${between}${afterLimits}`;
}
