import fs from 'node:fs/promises'
import path from 'node:path'

import { Command } from 'commander'

import {
  explainAtPosition,
  fix,
  loadRuleFiles,
  scan,
  toJsonLines,
  toMarkdownFix,
  toMarkdownScan,
} from '@los-ast/core'

import { getProjectAdapter, listProjects } from '@los-ast/adapters'

function normalizeArray(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.flatMap((v) => String(v).split(',')).map((s) => s.trim()).filter(Boolean)
  return String(value).split(',').map((s) => s.trim()).filter(Boolean)
}

async function resolveWorkspace(options) {
  if (options.project && options.project !== 'custom') {
    const adapter = getProjectAdapter(options.project)
    return {
      project: adapter.project,
      rootDir: adapter.rootDir,
      include: normalizeArray(options.include).length ? normalizeArray(options.include) : adapter.include,
      ignore: normalizeArray(options.ignore).length ? normalizeArray(options.ignore) : adapter.ignore,
      ruleGlobs: adapter.ruleGlobs,
    }
  }
  if (options.root) {
    const project = options.project || 'custom'
    return {
      project,
      rootDir: path.resolve(options.root),
      include: normalizeArray(options.include),
      ignore: normalizeArray(options.ignore),
      // 解析顺序：language base -> project extension
      ruleGlobs: [
        'rules/languages/**/*.yml',
        'rules/languages/**/*.yaml',
        `rules/projects/${project}/**/*.yml`,
        `rules/projects/${project}/**/*.yaml`,
      ],
    }
  }
  throw new Error(`missing required option: --root (or use --project ${listProjects().join('|')})`)
}

async function resolveRules(options) {
  const ws = await resolveWorkspace(options)
  // 基础规则：language base -> project extension
  const basePatterns = ws.ruleGlobs

  // 显式附加规则（作为 addon 追加，而非替换）
  const explicitPatterns = normalizeArray(options.rules)

  // 合并规则：base + explicit addons
  const allPatterns = [...basePatterns, ...explicitPatterns]

  if (allPatterns.length === 0) {
    return []
  }

  return await loadRuleFiles(allPatterns)
}

async function writeOutput({ format, payload, project, quietMachine = false, deterministic = false, isError = false }) {
  if (format === 'jsonl') {
    const lines = Array.isArray(payload) ? toJsonLines(payload, deterministic) : toJsonLines([payload], deterministic)
    if (quietMachine) {
      // 机器模式：stdout 只输出数据，错误通过 stderr
      if (isError) {
        process.stderr.write(lines)
      } else {
        process.stdout.write(lines)
      }
    } else {
      process.stdout.write(lines)
    }
    return
  }
  if (format === 'json') {
    // 单个 JSON 对象输出（用于 explain）
    let output
    if (deterministic) {
      // 深排序键以确保确定性输出
      const deepSort = (obj) => {
        if (obj === null || typeof obj !== 'object') return obj
        if (Array.isArray(obj)) return obj.map(deepSort)
        const sorted = {}
        for (const key of Object.keys(obj).sort()) {
          sorted[key] = deepSort(obj[key])
        }
        return sorted
      }
      output = JSON.stringify(deepSort(payload), null, 2)
    } else {
      output = JSON.stringify(payload, null, 2)
    }
    const fullOutput = output.endsWith('\n') ? output : output + '\n'
    if (quietMachine) {
      if (isError) {
        process.stderr.write(fullOutput)
      } else {
        process.stdout.write(fullOutput)
      }
    } else {
      process.stdout.write(fullOutput)
    }
    return
  }
  if (format === 'md') {
    const output = String(payload)
    const fullOutput = output.endsWith('\n') ? output : output + '\n'
    if (quietMachine && isError) {
      process.stderr.write(fullOutput)
    } else {
      process.stdout.write(fullOutput)
    }
    return
  }
  throw new Error(`unsupported format: ${format} (project=${project})`)
}

const program = new Command()
program.name('los-ast').description('AST scan/rewrite tool for multi repos').version('0')

program
  .command('scan')
  .description('Scan code for rule violations. Use --root for direct scanning or --project for pre-configured projects.')
  .option('--root <dir>', 'target root directory (recommended)')
  .option('--project <name>', `pre-configured project: ${listProjects().join('|')}`, 'custom')
  .option('--rules <glob...>', 'rule file globs, comma-separated (default: rules/**/*.yml)')
  .option('--include <glob...>', 'include patterns relative to root')
  .option('--ignore <glob...>', 'ignore patterns relative to root')
  .option('--format <format>', 'output format: jsonl|md', 'jsonl')
  .option('--quiet-machine', 'machine-friendly output (stdout for data, stderr for errors)', false)
  .option('--deterministic', 'deterministic output (stable sorting, timestamps)', false)
  .action(async (options) => {
    const ws = await resolveWorkspace(options)
    const rules = await resolveRules(options)
    const { rootDir, include, ignore, project } = ws

    const scanOptions = {
      project,
      rootDir,
      include,
      ignore,
      rules
    }
    // 只有显式指定 --deterministic 时才覆盖默认值
    if (options.deterministic) {
      scanOptions.deterministic = true
    }
    const res = await scan(scanOptions)
    if (options.format === 'md') {
      await writeOutput({ format: 'md', project, payload: toMarkdownScan({ project, ...res }), quietMachine: options.quietMachine, deterministic: options.deterministic })
      return
    }
    await writeOutput({ format: 'jsonl', project, payload: res.findings, quietMachine: options.quietMachine, deterministic: options.deterministic })
  })

program
  .command('fix')
  .description('Apply automatic fixes. Use --root for direct mode or --project for pre-configured projects.')
  .option('--root <dir>', 'target root directory (recommended)')
  .option('--project <name>', `pre-configured project: ${listProjects().join('|')}`, 'custom')
  .option('--rules <glob...>', 'rule file globs, comma-separated (default: rules/**/*.yml)')
  .option('--include <glob...>', 'include patterns relative to root')
  .option('--ignore <glob...>', 'ignore patterns relative to root')
  .option('--dry-run', 'print diff without writing', false)
  .option('--apply', 'write changes to disk', false)
  .option('--max-changes <n>', 'max number of matches to rewrite', '20')
  .option('--format <format>', 'output format: jsonl|md', 'jsonl')
  .option('--quiet-machine', 'machine-friendly output (stdout for data, stderr for errors)', false)
  .option('--deterministic', 'deterministic output (stable sorting, timestamps)', false)
  .action(async (options) => {
    const ws = await resolveWorkspace(options)
    const rules = await resolveRules(options)
    const { rootDir, include, ignore, project } = ws
    const maxChanges = Number(options.maxChanges)
    if (!Number.isFinite(maxChanges) || maxChanges <= 0) throw new Error('--max-changes must be a positive number')

    const fixOptions = {
      project,
      rootDir,
      include,
      ignore,
      rules,
      dryRun: Boolean(options.dryRun || !options.apply),
      apply: Boolean(options.apply),
      maxChanges
    }
    // 只有显式指定 --deterministic 时才覆盖默认值
    if (options.deterministic) {
      fixOptions.deterministic = true
    }
    const res = await fix(fixOptions)

    if (options.format === 'md') {
      await writeOutput({ format: 'md', project, payload: toMarkdownFix({ project, ...res }), quietMachine: options.quietMachine, deterministic: options.deterministic })
      return
    }
    await writeOutput({ format: 'jsonl', project, payload: res.results, quietMachine: options.quietMachine, deterministic: options.deterministic })
  })

program
  .command('explain')
  .description('Explain findings at a specific position')
  .option('--root <dir>', 'target root directory')
  .option('--project <name>', `cantool|lsclaw|fullstackframe|custom`, 'custom')
  .requiredOption('--file <path>', 'absolute file path')
  .requiredOption('--pos <line:col>', 'position in file, 1-based')
  .option('--rules <glob...>', 'yaml rule files glob(s), comma separated supported')
  .option('--quiet-machine', 'machine-friendly output (stdout for data, stderr for errors)', false)
  .option('--deterministic', 'deterministic output (stable sorting, timestamps)', false)
  .action(async (options) => {
    const ws = await resolveWorkspace(options)
    const rules = await resolveRules(options)

    const [lineRaw, colRaw] = String(options.pos).split(':')
    const line = Number(lineRaw)
    const column = Number(colRaw)
    if (!Number.isFinite(line) || !Number.isFinite(column) || line <= 0 || column <= 0) {
      throw new Error('--pos must be line:col and both are positive integers')
    }

    const resolvedFile = path.resolve(options.file)
    const resolvedRoot = path.resolve(ws.rootDir)

    // 验证文件路径在 rootDir 范围内（防止路径遍历）
    if (!resolvedFile.startsWith(resolvedRoot + path.sep) && resolvedFile !== resolvedRoot) {
      throw new Error(`file path must be within rootDir: ${resolvedFile} is not in ${resolvedRoot}`)
    }

    const explainOptions = {
      rootDir: ws.rootDir,
      file: resolvedFile,
      rules,
      line: line - 1,
      column: column - 1
    }
    // 只有显式指定 --deterministic 时才覆盖默认值
    if (options.deterministic) {
      explainOptions.deterministic = true
    }
    const res = await explainAtPosition(explainOptions)

    // 统一使用 writeOutput 处理输出
    await writeOutput({ format: 'json', payload: res, project: ws.project, quietMachine: options.quietMachine, deterministic: Boolean(options.deterministic) })
  })

program
  .command('doctor')
  .option('--root <dir>', 'optional root directory')
  .option('--project <name>', `cantool|lsclaw|fullstackframe|custom`, 'custom')
  .option('--rules <glob...>', 'yaml rule files glob(s), comma separated supported')
  .option('--quiet', 'no output on success', false)
  .action(async (options) => {
    const doctorOptions = { ...options, root: options.root || process.cwd() }
    const ws = await resolveWorkspace(doctorOptions)
    const rules = await resolveRules(doctorOptions)

    await fs.access(ws.rootDir)
    if (!options.quiet) {
      process.stdout.write(
        JSON.stringify(
          {
            ok: true,
            rootDir: ws.rootDir,
            project: ws.project,
            rulesLoaded: rules.length,
          },
          null,
          2,
        ) + '\n',
      )
    }
  })

try {
  await program.parseAsync(process.argv)
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e)
  process.stderr.write(`[los-ast] ${msg}\n`)
  process.exitCode = 1
}
