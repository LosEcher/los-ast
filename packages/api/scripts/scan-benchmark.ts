#!/usr/bin/env node
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';

type CliOptions = {
  files: number;
  iterations: number;
  concurrency: number;
  maxDurationMs: string;
  maxFilesLimit: string;
  rootDir?: string;
  rules?: string;
  keepFixture: boolean;
  outputPath?: string;
  help: boolean;
};

const args = process.argv.slice(2);

function getArgValue(name: string, fallback?: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0 || index + 1 >= args.length) {
    return fallback;
  }
  return args[index + 1];
}

function hasArg(name: string): boolean {
  return args.includes(name);
}

const options: CliOptions = {
  files: Number(getArgValue('--files', '10000')),
  iterations: Number(getArgValue('--iterations', '3')),
  concurrency: Number(getArgValue('--concurrency', '2')),
  maxDurationMs: getArgValue('--max-duration-ms', '120000'),
  maxFilesLimit: getArgValue('--max-files-limit', '20000'),
  rootDir: getArgValue('--root'),
  rules: getArgValue('--rules'),
  keepFixture: hasArg('--keep-fixture'),
  outputPath: getArgValue('--output'),
  help: hasArg('--help') || hasArg('-h'),
};

function usage(): string {
  return `
Usage:
  npx tsx scripts/scan-benchmark.ts [options]

Options:
  --files             Number of fixture files to generate (default: 10000)
  --iterations        Number of benchmark iterations (default: 3)
  --concurrency       Concurrent request count (default: 2)
  --max-duration-ms   SERVER max scan duration env (default: 120000)
  --max-files-limit   MAX_FILES_PER_SYNC_SCAN env (default: 20000)
  --root              Reuse an existing root directory (skip generation)
  --rules             Optional rule file path, e.g. ../../rules/languages/typescript/no-console-log.yml
  --keep-fixture      Keep generated fixture directory after benchmark
  --output            Output JSON report path, defaults to logs/scan-benchmark-<ts>.json
  --help, -h          Show help text

Examples:
  npx tsx scripts/scan-benchmark.ts --files 12000 --iterations 5
  npx tsx scripts/scan-benchmark.ts --root ./my-fixture --keep-fixture --output ./logs/bench.json
  `;
}

if (options.help) {
  console.log(usage());
  process.exit(0);
}

function clampPositiveInt(value: number, name: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  return value;
}

options.files = clampPositiveInt(options.files, '--files');
options.iterations = clampPositiveInt(options.iterations, '--iterations');
options.concurrency = clampPositiveInt(options.concurrency, '--concurrency');

if (!options.maxDurationMs || !/^\d+$/.test(options.maxDurationMs) || Number(options.maxDurationMs) < 1000) {
  throw new Error('Invalid --max-duration-ms');
}
if (!options.maxFilesLimit || !/^\d+$/.test(options.maxFilesLimit) || Number(options.maxFilesLimit) < 1) {
  throw new Error('Invalid --max-files-limit');
}

process.env.DEV_ALLOW_UNVERIFIED_IDENTITY = process.env.DEV_ALLOW_UNVERIFIED_IDENTITY ?? 'true';
process.env.MAX_SCAN_DURATION_MS = process.env.MAX_SCAN_DURATION_MS ?? options.maxDurationMs;
process.env.MAX_FILES_PER_SYNC_SCAN = process.env.MAX_FILES_PER_SYNC_SCAN ?? options.maxFilesLimit;

const [
  fastifyModule,
  errorHandlerModule,
  requestIdModule,
  scopeValidatorModule,
  healthCheckModule,
  cancellationModule,
  identityModule,
  scanRoutesModule,
] = await Promise.all([
  import('fastify'),
  import('../src/plugins/error-handler.js'),
  import('../src/plugins/request-id.js'),
  import('../src/plugins/scope-validator.js'),
  import('../src/plugins/health-check.js'),
  import('../src/plugins/cancellation.js'),
  import('../src/plugins/identity.js'),
  import('../src/routes/core/index.js'),
]);

  const Fastify = fastifyModule.default;
const requestIdPlugin = requestIdModule.default;
const errorHandlerPlugin = errorHandlerModule.default;
const scopeValidatorPlugin = scopeValidatorModule.default;
const healthCheckPlugin = healthCheckModule.default;
const cancellationPlugin = cancellationModule.default;
const identityPlugin = identityModule.default;
const { scanRoutes } = scanRoutesModule;

type DurationStats = {
  min: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  avg: number;
};

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function buildStats(values: number[]): DurationStats {
  if (values.length === 0) {
    return { min: 0, p50: 0, p95: 0, p99: 0, max: 0, avg: 0 };
  }

  const sum = values.reduce((acc, value) => acc + value, 0);
  return {
    min: Math.min(...values),
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
    max: Math.max(...values),
    avg: sum / values.length,
  };
}

async function generateFixture(rootDir: string, fileCount: number): Promise<void> {
  const perDir = 250;
  const directories = Math.ceil(fileCount / perDir);
  const contentTemplate = `export function noop_${0}() {\n  return true;\n}\n`;

  for (let i = 0; i < directories; i += 1) {
    const dir = join(rootDir, `bench-${String(i).padStart(4, '0')}`);
    await mkdir(dir, { recursive: true });
  }

  const writes = [];
  for (let i = 0; i < fileCount; i += 1) {
    const batchId = Math.floor(i / perDir);
    const fileName = `file-${String(i).padStart(6, '0')}.ts`;
    const filePath = join(rootDir, `bench-${String(batchId).padStart(4, '0')}`, fileName);
    const content = contentTemplate.replace('0', String(i));
    writes.push(writeFile(filePath, content, 'utf8'));
  }

  await Promise.all(writes);
}

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(requestIdPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(healthCheckPlugin);
  await app.register(cancellationPlugin);
  await app.register(scopeValidatorPlugin);
  await app.register(identityPlugin);
  await app.register(scanRoutes, { prefix: '/scan' });
  await app.ready();
  return app;
}

function buildPayload(rootDir: string, rules?: string) {
  const payload: Record<string, unknown> = {
    scope: {
      tenant_id: 'bench-tenant',
      project_id: 'bench-project',
      actor_id: 'bench-actor',
      mode: 'local',
    },
    project: 'bench-project',
    rootDir,
    deterministic: true,
    includeStats: false,
  };
  if (rules) {
    payload.rules = [rules];
  }
  return payload;
}

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

async function runBenchmark(): Promise<void> {
  const rootDir = options.rootDir
    ? options.rootDir
    : await mkdtemp(join(tmpdir(), 'los-ast-bench-'));
  let created = false;

  if (!options.rootDir) {
    created = true;
    await generateFixture(rootDir, options.files);
  }

  const app = await buildApp();

  const payload = buildPayload(rootDir, options.rules);
  const durations: number[] = [];
  const errors: number[] = [];
  const totalIterations = Math.max(1, options.iterations);

  // warm-up
  await app.inject({
    method: 'POST',
    url: '/scan',
    payload,
  });

  const batchDurationStart = performance.now();
  for (let i = 0; i < totalIterations; i += options.concurrency) {
    const currentBatch = Math.min(options.concurrency, totalIterations - i);
    const requests = Array.from({ length: currentBatch }).map(async () => {
      const requestStart = performance.now();
      const response = await app.inject({
        method: 'POST',
        url: '/scan',
        payload,
      });

      const elapsed = performance.now() - requestStart;
      if (response.statusCode !== 200) {
        return { statusCode: response.statusCode, elapsedMs: elapsed, error: true };
      }

      const body = JSON.parse(response.body);
      return {
        statusCode: response.statusCode,
        elapsedMs: elapsed,
        filesScanned: body?.data?.filesScanned ?? -1,
        error: false,
      };
    });

    const batchResults = await Promise.all(requests);
    for (const result of batchResults) {
      if (result.error) {
        errors.push(result.statusCode);
      } else {
        durations.push(result.elapsedMs);
      }
    }
  }
  const batchDurationEnd = performance.now();
  const totalWallClockMs = batchDurationEnd - batchDurationStart;
  const successful = durations.length;
  const failed = totalIterations - successful;
  const latencyStats = buildStats(durations);
  const wallClock = round(totalWallClockMs);
  const throughput = successful / (totalWallClockMs / 1000);

  const report = {
    createdAt: new Date().toISOString(),
    run: {
      files: options.files,
      iterations: totalIterations,
      concurrency: options.concurrency,
      source: 'packages/api/src/routes/core/scan',
      fixture: {
        path: rootDir,
        generated: created,
      },
      config: {
        maxScanDurationMs: process.env.MAX_SCAN_DURATION_MS,
        maxFilesPerSyncScan: process.env.MAX_FILES_PER_SYNC_SCAN,
      },
    },
    results: {
      total: totalIterations,
      success: successful,
      fail: failed,
      failStatusCodes: errors,
      latencyMs: {
        ...latencyStats,
        min: round(latencyStats.min, 2),
        max: round(latencyStats.max, 2),
        p50: round(latencyStats.p50, 2),
        p95: round(latencyStats.p95, 2),
        p99: round(latencyStats.p99, 2),
        avg: round(latencyStats.avg, 2),
      },
      throughputReqPerSec: Number.isFinite(throughput) ? round(throughput, 2) : 0,
      wallClockMs: wallClock,
    },
    payload: {
      deterministic: payload.deterministic,
      includeStats: payload.includeStats,
      hasRules: Boolean(options.rules),
      rules: options.rules ?? null,
    },
  };

  const outputPath = options.outputPath ?? join(process.cwd(), `logs/scan-benchmark-${Date.now()}.json`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`report.path=${outputPath}`);
  console.log(`success=${successful}/${totalIterations}`);
  console.log(`throughput=${report.results.throughputReqPerSec} req/s`);
  console.log(`latency p50/p95/p99=${report.results.latencyMs.p50}/${report.results.latencyMs.p95}/${report.results.latencyMs.p99} ms`);

  await app.close();

  if (created && !options.keepFixture) {
    await rm(rootDir, { recursive: true, force: true });
  }
}

await runBenchmark();
