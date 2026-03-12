import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import YAML from 'yaml';

import {
  scanNativeInputProperties,
  scanResponseDataSchema,
} from '../src/routes/core/scan-contract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const openApiPath = path.join(repoRoot, 'docs/api/openapi.yaml');
const generatedPath = path.join(repoRoot, 'docs/api/generated/scan-openapi-components.yaml');
const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');

const generatedBlocks = buildGeneratedBlocks();
const generatedBlock = generatedBlocks.join('\n\n');

if (!checkOnly) {
  fs.mkdirSync(path.dirname(generatedPath), { recursive: true });
  fs.writeFileSync(generatedPath, generatedBlock, 'utf8');
}

const openApiSource = fs.readFileSync(openApiPath, 'utf8');
const syncedOpenApi = replaceGeneratedBlocks(openApiSource);

if (checkOnly) {
  const generatedOnDisk = fs.existsSync(generatedPath) ? fs.readFileSync(generatedPath, 'utf8') : null;
  if (generatedOnDisk !== generatedBlock) {
    console.error(`[scan-openapi] Generated fragment drift detected: ${path.relative(repoRoot, generatedPath)}`);
    console.error('[scan-openapi] Run `npm --prefix packages/api run generate:scan-openapi-components` to refresh it.');
    process.exit(1);
  }

  if (syncedOpenApi !== openApiSource) {
    console.error(`[scan-openapi] Embedded OpenAPI block drift detected: ${path.relative(repoRoot, openApiPath)}`);
    console.error('[scan-openapi] Run `npm --prefix packages/api run generate:scan-openapi-components` to sync it.');
    process.exit(1);
  }

  console.log(`[scan-openapi] OpenAPI component blocks are up to date.`);
  process.exit(0);
}

fs.writeFileSync(openApiPath, syncedOpenApi, 'utf8');
console.log(`[scan-openapi] Wrote ${path.relative(repoRoot, generatedPath)}`);
console.log(`[scan-openapi] Synced ${path.relative(repoRoot, openApiPath)}`);

function buildGeneratedBlocks(): [string, string] {
  const scanRequest = {
    ScanRequest: {
      type: 'object',
      required: ['project'],
      properties: {
        scope: {
          $ref: '#/components/schemas/Scope',
        },
        project: {
          type: 'string',
          minLength: 1,
          description: '项目名称',
        },
        rootDir: {
          type: 'string',
          minLength: 1,
          description: '代码根目录路径；native-only 请求可省略',
        },
        include: {
          type: 'array',
          items: { type: 'string' },
          description: '包含模式（glob）',
        },
        ignore: {
          type: 'array',
          items: { type: 'string' },
          description: '忽略模式（glob）',
        },
        rules: {
          type: 'array',
          description: '规则文件 glob 列表；不传时不加载额外规则。',
          items: { type: 'string' },
        },
        rulePack: {
          type: 'string',
          enum: ['lsclaw-governance'],
          description: '内置规则包标识。当前支持 `lsclaw-governance`（在未传 `rules` 时生效）。',
        },
        deterministic: {
          type: 'boolean',
          description: '是否输出稳定排序/固定时间戳等确定性结果',
          default: false,
        },
        ...withPropertyDescriptions(scanNativeInputProperties),
        includeStats: {
          type: 'boolean',
          description: '是否包含解析统计（parseCache / parseFailures）',
          default: false,
        },
      },
    },
  };

  const scanResponse = {
    ScanResponse: {
      type: 'object',
      properties: {
        data: {
          ...scanResponseDataSchema,
          properties: {
            ...scanResponseDataSchema.properties,
            findings: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/Finding',
              },
            },
          },
        },
      },
    },
  };

  return [
    renderSchemaBlock('ScanRequest', scanRequest),
    renderSchemaBlock('ScanResponse', scanResponse),
  ];
}

function renderSchemaBlock(name: 'ScanRequest' | 'ScanResponse', schema: object): string {
  const yamlBody = YAML.stringify(schema, {
    indent: 2,
    lineWidth: 0,
  }).trimEnd();

  const indentedBody = yamlBody
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');

  return [
    `    # @generated scan-contract:${name}:begin`,
    indentedBody,
    `    # @generated scan-contract:${name}:end`,
  ].join('\n');
}

function replaceGeneratedBlocks(source: string): string {
  let next = source;

  for (const block of generatedBlocks) {
    const firstLine = block.split('\n')[1]?.trim();
    if (!firstLine) {
      continue;
    }

    const schemaName = firstLine.replace(/:$/, '');
    const beginMarker = `    # @generated scan-contract:${schemaName}:begin`;
    const endMarker = `    # @generated scan-contract:${schemaName}:end`;
    const markerPattern = new RegExp(
      `${escapeRegExp(beginMarker)}[\\s\\S]*${escapeRegExp(endMarker)}`,
      'm'
    );

    if (markerPattern.test(next)) {
      next = next.replace(markerPattern, block);
      next = removeLegacyDuplicateBlock(next, schemaName);
      continue;
    }

    const fallbackPattern = schemaName === 'ScanRequest'
      ? /^    ScanRequest:\n[\s\S]*?(?=^    ScanResponse:)/m
      : /^    ScanResponse:\n[\s\S]*?(?=^    Finding:)/m;

    if (!fallbackPattern.test(next)) {
      throw new Error(`Unable to locate ${schemaName} block in ${openApiPath}`);
    }

    next = next.replace(fallbackPattern, `${block}\n`);
    next = removeLegacyDuplicateBlock(next, schemaName);
  }

  return next;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function withPropertyDescriptions<T extends Record<string, any>>(properties: T): T {
  const descriptions: Record<string, string> = {
    openApiDocuments: '可选 OpenAPI 原生输入。每条文档会被解析为 `findingSource=contract` 的 findings。',
    openApiComparisons: '可选 OpenAPI 对比输入。每个 baseline/current 对会被解析为 `findingSource=contract` 的 compatibility findings。',
    schemaDocuments: '可选 schema 原生输入。每条文档会被解析为 `findingSource=schema` 的 findings。',
    schemaComparisons: '可选 schema 对比输入。每个 baseline/current 对会被解析为 `findingSource=schema` 的 breaking-risk findings。',
    contractArtifacts: '可选 contract 来源 findings 输入。每条记录会被转换为 `findingSource=contract` 的 finding。',
    schemaArtifacts: '可选 schema 来源 findings 输入。每条记录会被转换为 `findingSource=schema` 的 finding。',
  };

  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [
      key,
      {
        ...value,
        description: descriptions[key] ?? value.description,
      },
    ])
  ) as T;
}

function removeLegacyDuplicateBlock(source: string, schemaName: string): string {
  const cleanupPattern = schemaName === 'ScanRequest'
    ? new RegExp(
        `(\\n\\s*# @generated scan-contract:${schemaName}:end\\n)(\\s*${schemaName}:\\n[\\s\\S]*?)(?=^\\s*# @generated scan-contract:ScanResponse:begin|^\\s*ScanResponse:)`,
        'm'
      )
    : new RegExp(
        `(\\n\\s*# @generated scan-contract:${schemaName}:end\\n)(\\s*${schemaName}:\\n[\\s\\S]*?)(?=^\\s*Finding:)`,
        'm'
      );

  return source.replace(cleanupPattern, '$1');
}
