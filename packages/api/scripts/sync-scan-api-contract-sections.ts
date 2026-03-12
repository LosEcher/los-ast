import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const apiContractPath = path.join(repoRoot, 'packages/api/docs/api/API_CONTRACT.md');
const referencePath = path.join(repoRoot, 'packages/api/docs/api/generated/scan-contract-reference.json');
const generatedPath = path.join(repoRoot, 'packages/api/docs/api/generated/scan-api-contract-sections.md');
const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');

type ScanContractReference = {
  request: {
    required: string[];
    baseProperties: string[];
    nativeInputProperties: string[];
    allProperties: string[];
    notes: {
      scopeOptional: boolean;
      rootDirConditional: boolean;
      deterministicDefault: boolean;
    };
  };
  response: {
    rootProperties: string[];
    dataProperties: string[];
  };
};

const reference = JSON.parse(fs.readFileSync(referencePath, 'utf8')) as ScanContractReference;
const generatedSections = buildGeneratedSections(reference);

if (!checkOnly) {
  fs.mkdirSync(path.dirname(generatedPath), { recursive: true });
  fs.writeFileSync(generatedPath, `${generatedSections}\n`, 'utf8');
}

const currentApiContract = fs.readFileSync(apiContractPath, 'utf8');
const nextApiContract = replaceGeneratedSection(currentApiContract, generatedSections);

if (checkOnly) {
  const currentGenerated = fs.existsSync(generatedPath) ? fs.readFileSync(generatedPath, 'utf8') : null;
  if (currentGenerated !== `${generatedSections}\n`) {
    console.error(`[scan-api-contract] Generated section drift detected: ${path.relative(repoRoot, generatedPath)}`);
    console.error('[scan-api-contract] Run `npm --prefix packages/api run generate:scan-api-contract-sections` to refresh it.');
    process.exit(1);
  }

  if (currentApiContract !== nextApiContract) {
    console.error(`[scan-api-contract] Embedded API contract section drift detected: ${path.relative(repoRoot, apiContractPath)}`);
    console.error('[scan-api-contract] Run `npm --prefix packages/api run generate:scan-api-contract-sections` to sync it.');
    process.exit(1);
  }

  console.log('[scan-api-contract] API_CONTRACT generated sections are up to date.');
  process.exit(0);
}

fs.writeFileSync(apiContractPath, nextApiContract, 'utf8');
console.log(`[scan-api-contract] Wrote ${path.relative(repoRoot, generatedPath)}`);
console.log(`[scan-api-contract] Synced ${path.relative(repoRoot, apiContractPath)}`);

function buildGeneratedSections(referenceData: ScanContractReference): string {
  const requestTable = [
    '| Field | Required | Notes |',
    '|-------|----------|-------|',
    ...referenceData.request.allProperties.map((field) => {
      if (field === 'project') {
        return '| `project` | Yes | Stable request identifier for the scan target |';
      }
      if (field === 'scope') {
        return `| \`scope\` | No | Compatibility context object; production identity should be derived from verified auth, not trusted as the sole source |`;
      }
      if (field === 'rootDir') {
        return '| `rootDir` | Conditional | Required only when the request implies AST/code scanning; native-only inputs may omit it |';
      }
      if (field === 'deterministic') {
        return `| \`deterministic\` | No | Optional stable output mode; current default is \`${referenceData.request.notes.deterministicDefault}\` |`;
      }
      if (field === 'includeStats') {
        return '| `includeStats` | No | Enables `parseCache`, `parseFailures`, and `scanTelemetry` in the response |';
      }
      if (referenceData.request.nativeInputProperties.includes(field)) {
        return `| \`${field}\` | No | Native governance input channel; may be supplied without \`rootDir\` |`;
      }
      return `| \`${field}\` | No | Optional scan request field |`;
    }),
  ].join('\n');

  const requestSnippet = [
    '```typescript',
    'interface ScanRequest {',
    ...referenceData.request.allProperties.map((field) => {
      const optional = field === 'project' ? '' : '?';
      if (field === 'scope') {
        return '  scope?: Scope;';
      }
      if (referenceData.request.nativeInputProperties.includes(field)) {
        return `  ${field}${optional}: unknown[];`;
      }
      if (field === 'include' || field === 'ignore' || field === 'rules') {
        return `  ${field}${optional}: string[];`;
      }
      if (field === 'includeStats' || field === 'deterministic') {
        return `  ${field}${optional}: boolean;`;
      }
      return `  ${field}${optional}: string;`;
    }),
    '}',
    '```',
  ].join('\n');

  const responseSnippet = [
    '```typescript',
    'interface ScanResponse {',
    '  data: {',
    ...referenceData.response.dataProperties.map((field) => {
      if (field === 'filesScanned') return '    filesScanned: number;';
      if (field === 'findings') return '    findings: Finding[];';
      return `    ${field}?: unknown;`;
    }),
    '  };',
    '}',
    '```',
  ].join('\n');

  const responseList = referenceData.response.dataProperties
    .map((field) => `- \`${field}\``)
    .join('\n');

  return [
    '<!-- @generated scan-api-contract:begin -->',
    '### Body',
    '',
    requestSnippet,
    '',
    '#### Field Descriptions',
    '',
    requestTable,
    '',
    `When \`rootDir\` is omitted, the request must provide at least one native input set: ${referenceData.request.nativeInputProperties.map((field) => `\`${field}\``).join(', ')}.`,
    '',
    '## Response Schema',
    '',
    '### Success (200 OK)',
    '',
    responseSnippet,
    '',
    'Current `data` properties:',
    '',
    responseList,
    '<!-- @generated scan-api-contract:end -->',
  ].join('\n');
}

function replaceGeneratedSection(source: string, generated: string): string {
  const pattern = /<!-- @generated scan-api-contract:begin -->[\s\S]*<!-- @generated scan-api-contract:end -->/m;
  let next = pattern.test(source)
    ? source.replace(pattern, generated)
    : source;

  if (!pattern.test(source)) {
    const startMarker = '### Body';
    const endMarker = '### Example Request';
    const startIndex = source.indexOf(startMarker);
    const endIndex = source.indexOf(endMarker);
    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
      throw new Error(`Unable to locate Body/Example Request section in ${apiContractPath}`);
    }

    next = `${source.slice(0, startIndex)}${generated}\n\n${source.slice(endIndex)}`;
  }

  return next.replace(
    /### Example Request[\s\S]*?## Response Schema[\s\S]*?(?=### Example Success Response)/m,
    (match) => {
      const exampleRequestIndex = match.indexOf('### Example Request');
      const responseSchemaIndex = match.indexOf('## Response Schema');
      return `${match.slice(exampleRequestIndex, responseSchemaIndex)}`;
    }
  );
}
