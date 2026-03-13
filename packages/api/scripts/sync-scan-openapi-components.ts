import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import YAML from 'yaml';

import {
  scanNativeInputProperties,
  scanResponseDataSchema,
} from '../src/routes/core/scan-contract.js';
import {
  SCAN_LIMIT_REFERENCE,
  SCAN_OPENAPI_CANCELLATION_SEMANTICS,
  SCAN_OPENAPI_ERROR_RESPONSES,
  SCAN_OPENAPI_OPERATION_SUMMARY,
  SCAN_OPENAPI_REQUEST_EXAMPLES,
  SCAN_OPENAPI_SCOPE_REQUIREMENTS,
} from '../src/routes/core/scan-doc-contract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const openApiPath = path.join(repoRoot, 'docs/api/openapi.yaml');
const generatedPath = path.join(repoRoot, 'docs/api/generated/scan-openapi-components.yaml');
const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');

const generatedBlocks = buildGeneratedBlocks();
const generatedBlock = generatedBlocks.map((item) => item.block).join('\n\n');

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

  console.log('[scan-openapi] OpenAPI component blocks are up to date.');
  process.exit(0);
}

fs.writeFileSync(openApiPath, syncedOpenApi, 'utf8');
console.log(`[scan-openapi] Wrote ${path.relative(repoRoot, generatedPath)}`);
console.log(`[scan-openapi] Synced ${path.relative(repoRoot, openApiPath)}`);

type GeneratedBlock = {
  block: string;
  name: 'ScanPath' | 'ScanRequest' | 'ScanResponse';
};

function buildGeneratedBlocks(): GeneratedBlock[] {
  const scanPath = {
    '/scan': {
      post: {
        summary: SCAN_OPENAPI_OPERATION_SUMMARY,
        description: buildScanPathDescription(),
        tags: ['Scan'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ScanRequest',
              },
              examples: SCAN_OPENAPI_REQUEST_EXAMPLES,
            },
          },
        },
        responses: {
          '200': {
            description: '扫描成功',
            headers: {
              'X-Request-ID': {
                description: '请求追踪 ID',
                schema: {
                  type: 'string',
                },
              },
            },
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ScanResponse',
                },
              },
            },
          },
          ...buildScanErrorResponses(),
        },
      },
    },
  };

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
    renderPathBlock('ScanPath', scanPath),
    renderSchemaBlock('ScanRequest', scanRequest),
    renderSchemaBlock('ScanResponse', scanResponse),
  ];
}

function renderPathBlock(name: 'ScanPath', schema: object): GeneratedBlock {
  const yamlBody = YAML.stringify(schema, {
    indent: 2,
    lineWidth: 0,
  }).trimEnd();

  const indentedBody = yamlBody
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');

  return {
    name,
    block: [
      `  # @generated scan-contract:${name}:begin`,
      indentedBody,
      `  # @generated scan-contract:${name}:end`,
    ].join('\n'),
  };
}

function renderSchemaBlock(name: 'ScanRequest' | 'ScanResponse', schema: object): GeneratedBlock {
  const yamlBody = YAML.stringify(schema, {
    indent: 2,
    lineWidth: 0,
  }).trimEnd();

  const indentedBody = yamlBody
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');

  return {
    name,
    block: [
      `    # @generated scan-contract:${name}:begin`,
      indentedBody,
      `    # @generated scan-contract:${name}:end`,
    ].join('\n'),
  };
}

function replaceGeneratedBlocks(source: string): string {
  let next = source;

  for (const { name, block } of generatedBlocks) {
    const markerIndent = name === 'ScanPath' ? '  ' : '    ';
    const beginMarker = `${markerIndent}# @generated scan-contract:${name}:begin`;
    const endMarker = `${markerIndent}# @generated scan-contract:${name}:end`;
    const markerPattern = new RegExp(
      `${escapeRegExp(beginMarker)}[\\s\\S]*${escapeRegExp(endMarker)}`,
      'm'
    );

    if (markerPattern.test(next)) {
      next = next.replace(markerPattern, block);
      next = removeLegacyDuplicateBlock(next, name);
      continue;
    }

    const fallbackPattern = name === 'ScanPath'
      ? /^  \/scan:\n[\s\S]*?(?=^  \/discover\/symbols:)/m
      : name === 'ScanRequest'
        ? /^    ScanRequest:\n[\s\S]*?(?=^    ScanResponse:)/m
        : /^    ScanResponse:\n[\s\S]*?(?=^    Finding:)/m;

    if (!fallbackPattern.test(next)) {
      throw new Error(`Unable to locate ${name} block in ${openApiPath}`);
    }

    next = next.replace(fallbackPattern, `${block}\n`);
    next = removeLegacyDuplicateBlock(next, name);
  }

  return next;
}

function buildScanPathDescription(): string {
  const limitMap = new Map(SCAN_LIMIT_REFERENCE.map((entry) => [entry.name, entry.value]));

  return [
    '同步扫描代码库，返回发现的 issues。',
    '',
    '## 限制',
    `- 最大文件数：${limitMap.get('Max Files (Sync)')}（可配置）`,
    `- 最大响应大小：${limitMap.get('Response Size')}（可配置）`,
    `- 最大执行时间：${limitMap.get('Timeout')}（可配置）`,
    '',
    '## 取消语义',
    ...SCAN_OPENAPI_CANCELLATION_SEMANTICS.map((item) => `- ${item}`),
    '',
    '## Scope 要求',
    ...SCAN_OPENAPI_SCOPE_REQUIREMENTS.map((item) => `- ${item}`),
  ].join('\n');
}

function buildScanErrorResponses(): Record<string, object> {
  return Object.fromEntries(
    Object.entries(SCAN_OPENAPI_ERROR_RESPONSES).map(([status, config]) => [
      status,
      {
        description: config.description,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ErrorResponse',
            },
            examples: config.examples,
          },
        },
      },
    ])
  );
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

function removeLegacyDuplicateBlock(source: string, name: GeneratedBlock['name']): string {
  const cleanupPattern = name === 'ScanPath'
    ? new RegExp(
        `(\\n\\s*# @generated scan-contract:${name}:end\\n)(\\s*\\/scan:\\n[\\s\\S]*?)(?=^\\s*\\/discover\\/symbols:)`,
        'm'
      )
    : name === 'ScanRequest'
      ? new RegExp(
          `(\\n\\s*# @generated scan-contract:${name}:end\\n)(\\s*ScanRequest:\\n[\\s\\S]*?)(?=^\\s*# @generated scan-contract:ScanResponse:begin|^\\s*ScanResponse:)`,
          'm'
        )
      : new RegExp(
          `(\\n\\s*# @generated scan-contract:${name}:end\\n)(\\s*ScanResponse:\\n[\\s\\S]*?)(?=^\\s*Finding:)`,
          'm'
        );

  return source.replace(cleanupPattern, '$1');
}
