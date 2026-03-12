import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SCAN_DETERMINISTIC_REFERENCE,
  SCAN_TESTING_REFERENCE,
  SCAN_VERSION_STABILITY_REFERENCE,
} from '../src/routes/core/scan-doc-contract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const apiContractPath = path.join(repoRoot, 'packages/api/docs/api/API_CONTRACT.md');
const generatedPath = path.join(repoRoot, 'packages/api/docs/api/generated/scan-api-contract-stability-sections.md');
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
    console.error(`[scan-api-contract-stability] Generated section drift detected: ${path.relative(repoRoot, generatedPath)}`);
    console.error('[scan-api-contract-stability] Run `npm --prefix packages/api run generate:scan-api-contract-stability-sections` to refresh it.');
    process.exit(1);
  }

  if (currentApiContract !== nextApiContract) {
    console.error(`[scan-api-contract-stability] Embedded API contract section drift detected: ${path.relative(repoRoot, apiContractPath)}`);
    console.error('[scan-api-contract-stability] Run `npm --prefix packages/api run generate:scan-api-contract-stability-sections` to sync it.');
    process.exit(1);
  }

  console.log('[scan-api-contract-stability] API_CONTRACT stability sections are up to date.');
  process.exit(0);
}

fs.writeFileSync(apiContractPath, nextApiContract, 'utf8');
console.log(`[scan-api-contract-stability] Wrote ${path.relative(repoRoot, generatedPath)}`);
console.log(`[scan-api-contract-stability] Synced ${path.relative(repoRoot, apiContractPath)}`);

function buildGeneratedSections(): string {
  const guarantees = SCAN_VERSION_STABILITY_REFERENCE.guarantees
    .map((item, index) => `${index + 1}. **${item.split(': ')[0]}**: ${item.split(': ').slice(1).join(': ')}`)
    .join('\n');

  const deterministicTable = [
    '| Aspect | Behavior |',
    '|--------|----------|',
    ...SCAN_DETERMINISTIC_REFERENCE.rows.map((row) => `| ${row.aspect} | ${row.behavior} |`),
  ].join('\n');

  const testingSnippet = [
    '```typescript',
    ...SCAN_TESTING_REFERENCE.snippet,
    '```',
  ].join('\n');

  return [
    '<!-- @generated scan-api-contract-stability:begin -->',
    '## Version Stability Guarantee',
    '',
    SCAN_VERSION_STABILITY_REFERENCE.title,
    '',
    guarantees,
    '',
    `Deprecation policy: ${SCAN_VERSION_STABILITY_REFERENCE.deprecationPolicy}`,
    '',
    '## Deterministic Output',
    '',
    SCAN_DETERMINISTIC_REFERENCE.intro,
    '',
    deterministicTable,
    '',
    SCAN_DETERMINISTIC_REFERENCE.nondeterministicNote,
    '',
    '## Testing',
    '',
    SCAN_TESTING_REFERENCE.intro,
    '',
    testingSnippet,
    '',
    'Run contract tests:',
    '```bash',
    SCAN_TESTING_REFERENCE.command,
    '```',
    '<!-- @generated scan-api-contract-stability:end -->',
  ].join('\n');
}

function replaceGeneratedSections(source: string, generated: string): string {
  const markerPattern = /<!-- @generated scan-api-contract-stability:begin -->[\s\S]*<!-- @generated scan-api-contract-stability:end -->/m;
  if (markerPattern.test(source)) {
    return source.replace(markerPattern, generated);
  }

  const start = source.indexOf('## Version Stability Guarantee');
  if (start === -1) {
    throw new Error(`Unable to locate Version Stability section in ${apiContractPath}`);
  }

  return `${source.slice(0, start)}${generated}\n`;
}
