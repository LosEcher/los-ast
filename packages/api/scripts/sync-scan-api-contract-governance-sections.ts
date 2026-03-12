import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SCAN_CLI_API_PARITY_REFERENCE,
  SCAN_GOVERNANCE_OVERVIEW,
} from '../src/routes/core/scan-doc-contract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const apiContractPath = path.join(repoRoot, 'packages/api/docs/api/API_CONTRACT.md');
const generatedPath = path.join(repoRoot, 'packages/api/docs/api/generated/scan-api-contract-governance-sections.md');
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
    console.error(`[scan-api-contract-governance] Generated section drift detected: ${path.relative(repoRoot, generatedPath)}`);
    console.error('[scan-api-contract-governance] Run `npm --prefix packages/api run generate:scan-api-contract-governance-sections` to refresh it.');
    process.exit(1);
  }

  if (currentApiContract !== nextApiContract) {
    console.error(`[scan-api-contract-governance] Embedded API contract section drift detected: ${path.relative(repoRoot, apiContractPath)}`);
    console.error('[scan-api-contract-governance] Run `npm --prefix packages/api run generate:scan-api-contract-governance-sections` to sync it.');
    process.exit(1);
  }

  console.log('[scan-api-contract-governance] API_CONTRACT governance sections are up to date.');
  process.exit(0);
}

fs.writeFileSync(apiContractPath, nextApiContract, 'utf8');
console.log(`[scan-api-contract-governance] Wrote ${path.relative(repoRoot, generatedPath)}`);
console.log(`[scan-api-contract-governance] Synced ${path.relative(repoRoot, apiContractPath)}`);

function buildGeneratedSections(): string {
  const governanceTable = [
    '| 维度 | 当前状态 | 说明 |',
    '|------|----------|------|',
    ...SCAN_GOVERNANCE_OVERVIEW.rows.map((row) => `| ${row.dimension} | ${row.status} | ${row.details} |`),
  ].join('\n');

  const governanceReferences = SCAN_GOVERNANCE_OVERVIEW.references
    .map((ref) => `- \`${ref}\``)
    .join('\n');

  const cliParityTable = [
    '| CLI Option | API Field | Notes |',
    '|------------|-----------|-------|',
    ...SCAN_CLI_API_PARITY_REFERENCE.mappings.map((row) => `| ${row.cliOption} | ${row.apiField} | ${row.notes} |`),
  ].join('\n');

  return [
    '<!-- @generated scan-api-contract-governance:begin -->',
    '## Governance Scope Note (March 2026)',
    '',
    SCAN_GOVERNANCE_OVERVIEW.intro,
    '',
    governanceTable,
    '',
    SCAN_GOVERNANCE_OVERVIEW.findingSourceNote,
    '',
    '更多 parser 能力边界与发布说明见：',
    '',
    governanceReferences,
    '',
    '## CLI/API Parity',
    '',
    SCAN_CLI_API_PARITY_REFERENCE.intro,
    '',
    '```bash',
    '# CLI output (JSONL format)',
    SCAN_CLI_API_PARITY_REFERENCE.exampleCommand,
    '```',
    '',
    'CLI options map to API fields:',
    '',
    cliParityTable,
    '<!-- @generated scan-api-contract-governance:end -->',
  ].join('\n');
}

function replaceGeneratedSections(source: string, generated: string): string {
  const markerPattern = /<!-- @generated scan-api-contract-governance:begin -->[\s\S]*<!-- @generated scan-api-contract-governance:end -->/m;
  if (markerPattern.test(source)) {
    return source.replace(markerPattern, generated);
  }

  const governanceStart = source.indexOf('## Governance Scope Note (March 2026)');
  const versionStabilityStart = source.indexOf('## Version Stability Guarantee');
  if (governanceStart === -1 || versionStabilityStart === -1 || versionStabilityStart <= governanceStart) {
    throw new Error(`Unable to locate Governance/Version Stability sections in ${apiContractPath}`);
  }

  return `${source.slice(0, governanceStart)}${generated}\n\n${source.slice(versionStabilityStart)}`;
}
