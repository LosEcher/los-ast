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
    return {
      project: options.project || 'custom',
      rootDir: path.resolve(options.root),
      include: normalizeArray(options.include),
      ignore: normalizeArray(options.ignore),
      ruleGlobs: ['rules/**/*.yml', 'rules/**/*.yaml'],
    }
  }
  throw new Error(`missing required option: --root (or use --project ${listProjects().join('|')})`)
}

async function resolveRules(options) {
  const patterns = normalizeArray(options.rules)
  if (patterns.length === 0) {
    const ws = await resolveWorkspace(options)
    return await loadRuleFiles(ws.ruleGlobs)
  }
  return await loadRuleFiles(patterns)
}

async function writeOutput({ format, payload, project }) {
  if (format === 'jsonl') {
    const lines = Array.isArray(payload) ? toJsonLines(payload) : toJsonLines([payload])
    process.stdout.write(lines)
    return
  }
  if (format === 'md') {
    process.stdout.write(String(payload))
    if (!String(payload).endsWith('\n')) process.stdout.write('\n')
    return
  }
  throw new Error(`unsupported format: ${format} (project=${project})`)
}

const program = new Command()
program.name('los-ast').description('AST scan/rewrite tool for multi repos').version('0')

program
  .command('scan')
  .option('--root <dir>', 'target root directory')
  .option('--project <name>', `cantool|lsclaw|fullstackframe|custom`, 'custom')
  .option('--rules <glob...>', 'yaml rule files glob(s), comma separated supported')
  .option('--include <glob...>', 'include patterns relative to root')
  .option('--ignore <glob...>', 'ignore patterns relative to root')
  .option('--format <format>', 'jsonl|md', 'jsonl')
  .action(async (options) => {
    const ws = await resolveWorkspace(options)
    const rules = await resolveRules(options)
    const { rootDir, include, ignore, project } = ws

    const res = await scan({ project, rootDir, include, ignore, rules })
    if (options.format === 'md') {
      await writeOutput({ format: 'md', project, payload: toMarkdownScan({ project, ...res }) })
      return
    }
    await writeOutput({ format: 'jsonl', project, payload: res.findings })
  })

program
  .command('fix')
  .option('--root <dir>', 'target root directory')
  .option('--project <name>', `cantool|lsclaw|fullstackframe|custom`, 'custom')
  .option('--rules <glob...>', 'yaml rule files glob(s), comma separated supported')
  .option('--include <glob...>', 'include patterns relative to root')
  .option('--ignore <glob...>', 'ignore patterns relative to root')
  .option('--dry-run', 'print diff without writing', false)
  .option('--apply', 'write changes to disk', false)
  .option('--max-changes <n>', 'max number of matches to rewrite', '20')
  .option('--format <format>', 'jsonl|md', 'jsonl')
  .action(async (options) => {
    const ws = await resolveWorkspace(options)
    const rules = await resolveRules(options)
    const { rootDir, include, ignore, project } = ws
    const maxChanges = Number(options.maxChanges)
    if (!Number.isFinite(maxChanges) || maxChanges <= 0) throw new Error('--max-changes must be a positive number')

    const res = await fix({
      project,
      rootDir,
      include,
      ignore,
      rules,
      dryRun: Boolean(options.dryRun || !options.apply),
      apply: Boolean(options.apply),
      maxChanges,
    })

    if (options.format === 'md') {
      await writeOutput({ format: 'md', project, payload: toMarkdownFix({ project, ...res }) })
      return
    }
    await writeOutput({ format: 'jsonl', project, payload: res.results })
  })

program
  .command('explain')
  .option('--root <dir>', 'target root directory')
  .option('--project <name>', `cantool|lsclaw|fullstackframe|custom`, 'custom')
  .requiredOption('--file <path>', 'absolute file path')
  .requiredOption('--pos <line:col>', 'position in file, 1-based')
  .option('--rules <glob...>', 'yaml rule files glob(s), comma separated supported')
  .action(async (options) => {
    const ws = await resolveWorkspace(options)
    const rules = await resolveRules(options)

    const [lineRaw, colRaw] = String(options.pos).split(':')
    const line = Number(lineRaw)
    const column = Number(colRaw)
    if (!Number.isFinite(line) || !Number.isFinite(column) || line <= 0 || column <= 0) {
      throw new Error('--pos must be line:col and both are positive integers')
    }

    const res = await explainAtPosition({
      rootDir: ws.rootDir,
      file: path.resolve(options.file),
      rules,
      line: line - 1,
      column: column - 1,
    })

    process.stdout.write(JSON.stringify(res, null, 2) + '\n')
  })

program
  .command('doctor')
  .option('--root <dir>', 'optional root directory')
  .option('--project <name>', `cantool|lsclaw|fullstackframe|custom`, 'custom')
  .option('--rules <glob...>', 'yaml rule files glob(s), comma separated supported')
  .option('--quiet', 'no output on success', false)
  .action(async (options) => {
    const ws = await resolveWorkspace({ ...options, root: options.root || process.cwd() })
    const rules = await resolveRules(options)

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
