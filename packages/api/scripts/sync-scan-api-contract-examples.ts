import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildOutputSchema } from '@los-ast/ai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const apiContractPath = path.join(repoRoot, 'packages/api/docs/api/API_CONTRACT.md');
const generatedPath = path.join(repoRoot, 'packages/api/docs/api/generated/scan-api-contract-examples.md');
const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');

const generatedExamples = buildGeneratedExamples();

if (!checkOnly) {
  fs.mkdirSync(path.dirname(generatedPath), { recursive: true });
  fs.writeFileSync(generatedPath, `${generatedExamples}\n`, 'utf8');
}

const currentApiContract = fs.readFileSync(apiContractPath, 'utf8');
const nextApiContract = replaceGeneratedExamples(currentApiContract, generatedExamples);

if (checkOnly) {
  const currentGenerated = fs.existsSync(generatedPath) ? fs.readFileSync(generatedPath, 'utf8') : null;
  if (currentGenerated !== `${generatedExamples}\n`) {
    console.error(`[scan-api-contract-examples] Generated example drift detected: ${path.relative(repoRoot, generatedPath)}`);
    console.error('[scan-api-contract-examples] Run `npm --prefix packages/api run generate:scan-api-contract-examples` to refresh it.');
    process.exit(1);
  }

  if (currentApiContract !== nextApiContract) {
    console.error(`[scan-api-contract-examples] Embedded API contract examples drift detected: ${path.relative(repoRoot, apiContractPath)}`);
    console.error('[scan-api-contract-examples] Run `npm --prefix packages/api run generate:scan-api-contract-examples` to sync it.');
    process.exit(1);
  }

  console.log('[scan-api-contract-examples] API_CONTRACT examples are up to date.');
  process.exit(0);
}

fs.writeFileSync(apiContractPath, nextApiContract, 'utf8');
console.log(`[scan-api-contract-examples] Wrote ${path.relative(repoRoot, generatedPath)}`);
console.log(`[scan-api-contract-examples] Synced ${path.relative(repoRoot, apiContractPath)}`);

function buildGeneratedExamples(): string {
  const outputSchema = buildOutputSchema() as {
    properties: Record<string, unknown>;
  };

  const findingProperties = outputSchema.properties;
  const findingExample: Record<string, unknown> = {};
  for (const field of Object.keys(findingProperties)) {
    findingExample[field] = exampleFindingValue(field);
  }

  const exampleRequest = {
    scope: {
      tenant_id: 'org_123',
      project_id: 'myapp',
      actor_id: 'user_456',
      mode: 'service',
    },
    project: 'myapp',
    rootDir: '/workspace/myapp',
    include: ['src/**/*.ts'],
    ignore: ['**/*.spec.ts', 'node_modules/**'],
    includeStats: true,
    deterministic: true,
  };

  const exampleResponse = {
    data: {
      filesScanned: 42,
      findings: [findingExample],
      parseCache: {
        hits: 15,
        misses: 27,
        entries: 27,
        maxEntries: 100,
      },
      parseFailures: {
        count: 1,
        sampleLimit: 20,
        truncated: false,
        byLanguage: {
          JavaScript: 1,
        },
        samples: [
          {
            file: '/workspace/myapp/src/broken.js',
            language: 'JavaScript',
            error: 'Unexpected token',
          },
        ],
      },
      scanTelemetry: {
        durationMs: 37,
        mode: 'ast',
        explicitRulePatterns: 1,
        loadedRules: 12,
        estimatedFiles: 42,
        nativeInputs: {
          openApiDocuments: 0,
          openApiComparisons: 0,
          schemaDocuments: 0,
          schemaComparisons: 0,
          contractArtifacts: 0,
          schemaArtifacts: 0,
        },
      },
    },
  };

  return [
    '<!-- @generated scan-api-contract-examples:begin -->',
    '### Example Request',
    '',
    '```json',
    JSON.stringify(exampleRequest, null, 2),
    '```',
    '',
    '### Example Success Response',
    '',
    '```json',
    JSON.stringify(exampleResponse, null, 2),
    '```',
    '<!-- @generated scan-api-contract-examples:end -->',
  ].join('\n');
}

function exampleFindingValue(field: string): unknown {
  switch (field) {
    case 'tool':
      return 'los-ast';
    case 'version':
      return 1;
    case 'timestamp':
      return '2026-03-13T00:00:00.000Z';
    case 'project':
      return 'myapp';
    case 'ruleFile':
      return 'rules/languages/typescript/no-console.yml';
    case 'ruleId':
      return 'typescript/no-console';
    case 'findingSource':
      return 'ast';
    case 'governanceDomain':
      return ['frontend', 'api'];
    case 'impactHint':
      return 'medium';
    case 'severity':
      return 'warning';
    case 'message':
      return 'Unexpected console statement';
    case 'file':
      return '/workspace/myapp/src/index.ts';
    case 'language':
      return 'typescript';
    case 'range':
      return {
        start: { line: 10, column: 0, index: 245 },
        end: { line: 10, column: 11, index: 256 },
      };
    case 'excerpt':
      return 'console.log';
    case 'hasFix':
      return false;
    case 'proposedReplacement':
      return null;
    case 'diff':
      return null;
    case 'applied':
      return false;
    case 'fingerprint':
      return 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
    default:
      throw new Error(`No example value configured for field: ${field}`);
  }
}

function replaceGeneratedExamples(source: string, generated: string): string {
  const pattern = /<!-- @generated scan-api-contract-examples:begin -->[\s\S]*<!-- @generated scan-api-contract-examples:end -->/m;
  if (pattern.test(source)) {
    return source.replace(pattern, generated);
  }

  const startMarker = '### Example Request';
  const endMarker = '## Error Responses';
  const startIndex = source.indexOf(startMarker);
  const endIndex = source.indexOf(endMarker);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error(`Unable to locate example sections in ${apiContractPath}`);
  }

  return `${source.slice(0, startIndex)}${generated}\n\n${source.slice(endIndex)}`;
}
