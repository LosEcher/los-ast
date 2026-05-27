# External Agent Integration Guide

**Target audience**: AI agent / coding assistant developers who want to integrate los-ast as a code analysis and rewriting backend.
**Version**: 1.1
**Last updated**: 2026-05-26

---

## 1. What los-ast Provides for AI Agents

los-ast gives an external agent three core capabilities:

| Capability | What it means for the agent |
|---|---|
| **Structured code retrieval** | Get typed findings (file, range, severity, excerpt) instead of grep output |
| **Automated diagnostics** | Run rule packs against a codebase and get machine-readable JSONL results |
| **Safe batch refactoring** | Generate unified diffs, review them, and apply only when confirmed |

The tool is built on Tree-sitter + ast-grep, supporting: TypeScript, JavaScript, TSX, JSX, Rust, Python, Go.

---

## 2. Integration Modes — Decision Matrix

```
                    ┌──────────────────────────────────────────────┐
                    │         Which integration mode?              │
                    └──────────────────────────────────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
            ┌───────────┐       ┌───────────┐       ┌───────────┐
            │   CLI     │       │   API     │       │ Artifact  │
            │ (subprocess)│      │ (HTTP)   │       │ (file)    │
            └───────────┘       └───────────┘       └───────────┘
                    │                   │                   │
            One-shot scans     Long-running service   Batch export for
            CI/CD pipelines    Cancellation support   downstream systems
            Local dev          Streaming responses    Offline analysis
```

| Mode | Best for | Latency | Setup complexity | Requires service |
|------|----------|---------|------------------|------------------|
| **CLI subprocess** | CI pipelines, one-off analysis, local dev | Sub-second to minutes | Minimal | No |
| **HTTP API** | Long-running agents, cancelable scans, multi-tenant | Network + scan time | Medium | Yes (`npm run build:api`) |
| **Artifact files** | Downstream system consumption, offline analysis, batch processing | File I/O only | Low | No (pre-generated) |

---

## 3. CLI Integration (Recommended Starting Point)

### 3.1 Quick Start

```bash
# Install
cd los-ast && npm install

# Scan a project (read-only, always safe)
npm run los-ast -- scan \
  --root /path/to/target/project \
  --include "src/**/*.ts" \
  --format jsonl

# Generate fix diff (no writes)
npm run los-ast -- fix \
  --root /path/to/target/project \
  --include "src/**/*.ts" \
  --dry-run --max-changes 20

# Apply fixes (explicit opt-in)
npm run los-ast -- fix \
  --root /path/to/target/project \
  --include "src/**/*.ts" \
  --apply --max-changes 20
```

### 3.2 Piping from an AI Agent

```python
# Python agent example
import subprocess
import json

def scan_project(root: str, include: str = "src/**/*.ts") -> list[dict]:
    """Run los-ast scan and return parsed findings."""
    result = subprocess.run(
        [
            "npm", "run", "los-ast", "--",
            "scan",
            "--root", root,
            "--include", include,
            "--format", "jsonl",
            "--deterministic",
        ],
        cwd="/path/to/los-ast",
        capture_output=True,
        text=True,
        check=True,
    )
    findings = []
    for line in result.stdout.strip().split("\n"):
        if line:
            findings.append(json.loads(line))
    return findings
```

```typescript
// TypeScript agent example
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

interface Finding {
  ruleId: string;
  severity: "info" | "warning" | "error";
  file: string;
  message: string;
  range: { start: { line: number; column: number }; end: { line: number; column: number } };
  excerpt: string;
  hasFix: boolean;
  proposedReplacement: string | null;
  fingerprint: string;
}

async function scanProject(root: string): Promise<Finding[]> {
  const { stdout } = await execFileP("npm", [
    "run", "los-ast", "--",
    "scan", "--root", root,
    "--include", "src/**/*.ts",
    "--format", "jsonl",
    "--deterministic",
  ], { cwd: "/path/to/los-ast", maxBuffer: 50 * 1024 * 1024 });

  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
```

### 3.3 CLI Exit Codes

| Code | Meaning | Agent action |
|------|---------|-------------|
| 0 | Success, no findings or all fixes applied | Continue |
| 1 | Runtime error (invalid args, missing rules, etc.) | Report and stop |
| 0 + stderr | Scan succeeded with findings (findings go to stdout as JSONL) | Parse stdout for findings |

---

## 4. HTTP API Integration

### 4.1 Starting the API Server

```bash
cd los-ast
npm run build:api
cd packages/api && node dist/server.js
# API listening on http://localhost:3000
```

### 4.2 Health Check (No Auth Required)

```bash
curl http://localhost:3000/healthz/live   # → {"status":"alive",...}
curl http://localhost:3000/healthz/ready  # → {"status":"ready",...}
```

Your agent should poll `/healthz/ready` on startup and wait for `"ready"` before sending scan requests. If the API returns `503` with code `CORE_NOT_READY`, retry with exponential backoff.

### 4.3 Scan Request (Auth Required)

```typescript
const response = await fetch("http://localhost:3000/scan", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.LSCLAW_JWT}`,
    "X-Request-ID": crypto.randomUUID(),
  },
  body: JSON.stringify({
    project: "my-project",
    rootDir: "/path/to/target",
    include: ["src/**/*.ts", "src/**/*.tsx"],
    ignore: ["**/*.test.ts", "**/*.spec.ts"],
    includeStats: true,
    deterministic: true,
  }),
  signal: AbortSignal.timeout(30_000), // 30s timeout
});

if (!response.ok) {
  const { error } = await response.json();
  // Handle by category: VALIDATION → fix params, TIMEOUT → retry, etc.
  throw new Error(`[${error.code}] ${error.message}`);
}

const { data } = await response.json();
// data.findings → Finding[]
// data.scanTelemetry → { mode, durationMs, loadedRules, ... }
```

### 4.4 Cancellation

The API supports standard `AbortSignal` / fetch cancellation. Canceled scans return HTTP 408.

```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 10_000); // 10s max

const response = await fetch("http://localhost:3000/scan", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
  body: JSON.stringify(params),
  signal: controller.signal,
});
```

### 4.5 Authentication Setup

The API uses JWT for authentication. Environment variables:

```bash
# .env
ENFORCE_JWT=true
JWT_SECRET=<your-secret>
LSCLAW_JWT=<jwt-token-for-service-to-service>

# For local development only
DEV_ALLOW_UNVERIFIED_IDENTITY=true
```

For agent-to-agent communication, use a shared JWT secret and pass the token as `Authorization: Bearer <token>`.

### 4.6 API Rate Limits (Default)

| Limit | Default | Configurable via |
|-------|---------|------------------|
| Max files per scan | 1,000 | `MAX_FILES_PER_SYNC_SCAN` |
| Max response size | 10 MB | `MAX_RESPONSE_BYTES` |
| Max scan duration | 30 s | `MAX_SCAN_DURATION_MS` |

Large projects (>1,000 files) auto-promote to chunked map-reduce mode internally.

---

## 5. Artifact Consumption (Downstream Mode)

### 5.1 Generate Artifacts

```bash
npm run hub-lite:artifacts -- \
  --project lsclaw \
  --output-dir ./output \
  --deterministic
```

### 5.2 Artifact Manifest

| File | Format | Contents | Use case |
|------|--------|----------|----------|
| `scan-findings.jsonl` | JSON Lines | All findings with ruleId, file, range, severity, message, fingerprint | Primary input for agent reasoning |
| `symbols.json` | JSON | Discovered symbols (functions, classes, variables, types) by file | Codebase structure understanding |
| `structure-map.json` | JSON | File inventory, route declarations (Fastify), import graph, structural summary | Architecture analysis, route verification |

### 5.3 Consuming Artifacts

```typescript
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

async function* streamFindings(jsonlPath: string): AsyncGenerator<Finding> {
  const rl = createInterface({
    input: readFileSync(jsonlPath, "utf-8"),
  });
  for await (const line of rl) {
    if (line.trim()) yield JSON.parse(line);
  }
}

// Stream-process large finding sets
for await (const finding of streamFindings("./output/scan-findings.jsonl")) {
  if (finding.severity === "error") {
    // Prioritize errors
    await handleError(finding);
  }
}
```

### 5.4 Structure Map Fields (Key for Architecture-Aware Agents)

The `structure-map.json` provides:

```typescript
interface StructureMap {
  project: string;
  rootDir: string;
  structureFiles: string[];          // All discovered files
  structureSymbols: SymbolInfo[];    // Cross-file symbols
  structureImports: ImportEdge[];    // Static import graph
  routeDeclares: RouteDeclare[];     // Fastify route declarations
  routeMounts: RouteMount[];         // Route registration points
  routeBinds: RouteBind[];           // Handler-to-route bindings
  routeRuntime: RouteRuntime[];      // Runtime probe results
  routeRuntimeDeltas: Delta[];       // Static vs runtime diffs
  callEdges: CallEdge[];             // (experimental) Call graph edges
  importsV2: ImportV2[];             // (experimental) Resolved imports
  structuralSummary: StructuralSummary; // (experimental) Per-language stats
}
```

---

## 6. The Mandatory Safety Workflow

An external agent MUST follow this sequence for any code-changing operation:

```
SCAN ──→ DRY-RUN ──→ REVIEW ──→ APPLY ──→ VERIFY
  │          │           │          │          │
  │          │           │          │          └─ Run target's own tests/build
  │          │           │          └─ Explicit --apply flag
  │          │           └─ Agent reviews diff against rule messages
  │          └─ Generate unified diff, do NOT write to disk
  └─ Read-only, always safe
```

### Implementation

```python
def safe_refactor(root: str, rules: list[str], max_changes: int = 20):
    """Agent workflow: scan → dry-run → review → apply → verify."""

    # Step 1: Scan (read-only)
    findings = scan_project(root)
    if not findings:
        return {"status": "clean", "findings": []}

    # Step 2: Dry-run (generate diff)
    diff = dry_run_fix(root, rules, max_changes)
    if not diff:
        return {"status": "no_fixes", "findings": findings}

    # Step 3: Agent reviews diff
    # In a real agent, this is where you feed diff to the LLM for review
    approved = review_diff(diff, findings)

    # Step 4: Apply (explicit opt-in)
    if approved:
        apply_fix(root, rules, max_changes)

        # Step 5: Verify
        verify_result = run_target_tests(root)
        return {"status": "applied", "diff": diff, "verify": verify_result}

    return {"status": "review_rejected", "diff": diff, "findings": findings}
```

### Safety invariants

- **Never skip dry-run**. There is no `--apply` shortcut without `--dry-run` first.
- **Never do blind full-repo replacement**. Always go through rule-based matching.
- **Never exceed `--max-changes`**. This caps blast radius per operation.
- **Respect adapter boundaries**. The adapter's `include`/`ignore` patterns define what's in scope.

---

## 7. Configuring a Custom Project Adapter

### 7.1 Option A: `los-ast.config.json` (Recommended)

Place this in the agent's working directory (where it invokes los-ast):

```json
{
  "projects": {
    "my-agent-project": {
      "rootDir": "/path/to/target/repo",
      "include": ["src/**/*.{ts,tsx}", "lib/**/*.ts"],
      "ignore": ["**/node_modules/**", "**/dist/**", "**/__tests__/**"],
      "ruleGlobs": [
        "rules/languages/typescript/**/*.yml",
        "rules/projects/my-agent-project/**/*.yml"
      ],
      "languages": ["typescript", "javascript"],
      "experimentalExtractors": false
    }
  }
}
```

Then use: `npm run los-ast -- scan --project my-agent-project --format jsonl`

### 7.2 Option B: Environment Variable Override

```bash
export LOS_AST_PROJECT_MY_AGENT_PROJECT_ROOT=/path/to/target/repo
npm run los-ast -- scan --project my-agent-project
```

### 7.3 Option C: Direct `--root` Mode (No Config)

```bash
npm run los-ast -- scan \
  --root /path/to/target/repo \
  --include "src/**/*.ts" \
  --ignore "**/*.test.ts" \
  --format jsonl
```

### 7.4 Config Resolution Priority

```
Environment variable (LOS_AST_PROJECT_<NAME>_ROOT)
    ↓ overrides
External config file (los-ast.config.json)
    ↓ overrides
Built-in default (adapters/src/index.mjs)
```

---

## 8. Writing Custom Rules for a New Codebase

Rules are YAML files in `rules/languages/<lang>/` or `rules/projects/<project>/`.

### 8.1 Minimal Rule

```yaml
# rules/languages/typescript/no-debugger.yml
id: no-debugger
language: TypeScript
message: "Remove debugger statement before commit"
severity: error
rule:
  pattern: debugger
```

### 8.2 Rule with Fix

```yaml
# rules/languages/typescript/prefer-const.yml
id: prefer-const
language: TypeScript
message: "Use const for variables that are never reassigned"
severity: warning
rule:
  pattern: "let $VAR = $VAL"
  constraints:
    has:
      pattern: "const $VAR = $VAL"
      follow: true
fix: "const $VAR = $VAL"
```

### 8.3 Rule with Governance Metadata

```yaml
# rules/projects/my-project/security-no-eval.yml
id: security-no-eval
language: TypeScript
message: "eval() is a security risk"
severity: error
governance:
  domain: [security, backend]
  impact: high
rule:
  pattern: eval($$$)
```

### 8.4 Rule Loading

- All `.yml`/`.yaml` files under globs specified in the adapter's `ruleGlobs` are loaded
- Rules without a matching `language` for the scanned file are skipped
- The `governance` block is optional; findings inherit `governanceDomain` and `impactHint`

Reference: `docs/rules/RULE_AUTHORING.md`

---

## 9. Understanding the Output Format

### 9.1 Finding Record (JSONL)

Each line of JSONL output:

```json
{
  "tool": "los-ast",
  "version": 0,
  "timestamp": "2026-05-26T12:00:00.000Z",
  "project": "my-project",
  "ruleFile": "/abs/path/to/rules/no-console.yml",
  "ruleId": "no-console",
  "findingSource": "ast",
  "governanceDomain": ["frontend"],
  "impactHint": "low",
  "severity": "warning",
  "message": "Unexpected console statement",
  "file": "/abs/path/to/src/index.ts",
  "language": "TypeScript",
  "range": {
    "start": { "line": 10, "column": 0, "index": 200 },
    "end": { "line": 10, "column": 15, "index": 215 }
  },
  "excerpt": "console.log('debug')",
  "hasFix": true,
  "proposedReplacement": "",
  "diff": null,
  "fingerprint": "a1b2c3d4e5f6..."
}
```

### 9.2 Key Fields for Agent Consumption

| Field | Priority | How to use |
|-------|----------|-----------|
| `ruleId` | **High** | Group findings by rule type |
| `severity` | **High** | Sort/prioritize: error > warning > info |
| `file` | **High** | Navigate to the affected file |
| `range` | **High** | Highlight the exact code region |
| `message` | **High** | Explain the issue to the user |
| `excerpt` | Medium | Show the matched code inline |
| `hasFix` | Medium | Skip to next if no automatic fix available |
| `proposedReplacement` | Medium | Show what the fix would change it to |
| `fingerprint` | Low | Deduplicate across scans, track fix status |
| `governanceDomain` | Low | Filter by domain (security, frontend, etc.) |
| `impactHint` | Low | Estimate risk of not fixing |

### 9.3 Finding Source Channels

| `findingSource` | Meaning |
|---|---|
| `ast` | Found by AST-grep rule matching (primary channel) |
| `contract` | From OpenAPI / API contract analysis |
| `schema` | From SQL / Prisma schema analysis |

### 9.4 Scan Telemetry (API Response Only)

When `includeStats: true`:

```json
{
  "scanTelemetry": {
    "durationMs": 1234,
    "mode": "chunked",
    "explicitRulePatterns": 3,
    "loadedRules": 15,
    "estimatedFiles": 2500,
    "nativeInputs": {
      "openApiDocuments": 0,
      "openApiComparisons": 1,
      "schemaDocuments": 0,
      "schemaComparisons": 0,
      "contractArtifacts": 0,
      "schemaArtifacts": 0
    }
  },
  "_scanMode": {
    "mode": "chunked",
    "chunks": 5,
    "concurrency": 4
  },
  "_reduceStats": {
    "totalChunks": 5,
    "totalFindingsBeforeDedup": 342,
    "totalFindingsAfterDedup": 320,
    "dedupedFindings": 22
  }
}
```

### 9.5 JSON Schema

Machine-validatable schema at `packages/ai/schemas/los-ast-output.schema.json`:

```typescript
import { buildOutputSchema } from "@los-ast/ai";
import Ajv from "ajv";

const schema = buildOutputSchema();
const ajv = new Ajv();
const validate = ajv.compile(schema);

for (const finding of findings) {
  if (!validate(finding)) {
    console.warn("Schema violation:", validate.errors);
  }
}
```

---

## 10. Experimental: Call Graph & Import Resolution

Feature-gated behind `--experimental-extractors` (CLI) or `experimentalExtractors: true` (adapter config).

### 10.1 What it Provides

| Output | Description |
|--------|-------------|
| `callEdges[]` | `{ caller, callee, file, line }` — who calls whom |
| `importsV2[]` | `{ source_path, target_path, raw_specifier, resolved }` — resolved import graph |
| `structuralSummary` | `{ total_functions, total_classes, total_call_edges, by_language }` |

### 10.2 Supported Languages

TypeScript, JavaScript, TSX, JSX, Python, Go, Rust — each with a dedicated Tree-sitter extractor.

### 10.3 Enabling

```bash
# CLI
npm run los-ast -- scan --root /path --experimental-extractors --format jsonl

# Or via hub-lite:artifacts
npm run hub-lite:artifacts -- --root /path --experimental-extractors
```

The results appear in `structure-map.json` under `callEdges`, `importsV2`, and `structuralSummary`.

### 10.4 Chunked Extraction

For projects with >250 files, the extraction pipeline automatically splits into parallel chunks and reconciles cross-chunk call edges and imports using the same map-reduce pattern as the scan engine.

---

## 11. Error Handling for Agents

### 11.1 Unified Error Format (API)

```json
{
  "error": {
    "category": "VALIDATION",
    "code": "MISSING_ROOTDIR",
    "message": "rootDir must be a non-empty string",
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2026-05-26T12:00:00.000Z",
    "retryable": false
  }
}
```

### 11.2 Error Categories and Agent Actions

| Category | HTTP | Retryable | Agent action |
|----------|------|-----------|-------------|
| `VALIDATION` | 400 | No | Fix request params, do not retry |
| `SCOPE` | 403 | No | Check auth/permissions |
| `AUTHENTICATION` | 401 | No | Refresh JWT, check secret |
| `TIMEOUT` | 408 | Yes | Retry with backoff, increase timeout |
| `SCAN_TOO_LARGE` | 413 | No | Narrow include patterns, split into multiple scans |
| `NOT_FOUND` | 404 | No | Verify resource exists |
| `SERVICE_UNAVAILABLE` | 503 | Yes | Wait for `/healthz/ready`, exponential backoff |
| `INTERNAL` | 500 | Yes | Retry with backoff (max 3), then report |

### 11.3 CLI Error Handling

```python
import subprocess

def safe_scan(root: str) -> list[dict]:
    try:
        result = subprocess.run(
            ["npm", "run", "los-ast", "--", "scan", "--root", root, "--format", "jsonl"],
            cwd="/path/to/los-ast",
            capture_output=True, text=True, timeout=120,
            check=False,  # Don't raise on non-zero exit
        )
        # Findings go to stdout even on some error conditions
        findings = []
        for line in result.stdout.strip().split("\n"):
            if line:
                findings.append(json.loads(line))

        if result.returncode != 0:
            # Log stderr but still return any findings we got
            print(f"los-ast warning: {result.stderr}", file=sys.stderr)

        return findings
    except subprocess.TimeoutExpired:
        print("los-ast timed out", file=sys.stderr)
        return []
    except FileNotFoundError:
        print("los-ast not found — run `npm install` in los-ast directory", file=sys.stderr)
        return []
```

---

## 12. Performance and Scaling

### 12.1 Scan Modes (Automatic)

| Files | Mode | Concurrency | Overhead |
|-------|------|-------------|----------|
| < 100 | `single` | Sequential | Zero |
| 100–1,000 | `parallel` | Bounded async | Low |
| > 1,000 | `chunked` | Map → Reconcile → Reduce | Medium |

The mode is chosen automatically based on file count and cost estimates. No user configuration needed.

### 12.2 Parse Cache

los-ast caches parsed ASTs in memory. Default max: 128 entries. Cache is automatically shared across scan chunks.

### 12.3 Tips for Large Codebases

- **Narrow `include` patterns**: `"src/server/**/*.ts"` scans faster than `"src/**/*.ts"`
- **Use `--deterministic`**: Stable ordering and fingerprints, critical for comparing scans across time
- **Set generous timeouts**: 30s may not be enough for 5,000+ files. Set 120s+ for large repos.
- **Consider artifact mode**: Pre-generate artifacts for offline analysis of very large codebases
- **Use the chunked API**: For files > 1,000, the scan auto-promotes to chunked mode

---

## 13. Practical Usage Patterns for AI Agents

### 13.1 Pattern: "Find and explain issues"

```python
def audit_codebase(root: str) -> str:
    """Run a full scan and produce a human-readable audit report."""
    findings = scan_project(root)

    by_severity = {"error": [], "warning": [], "info": []}
    for f in findings:
        by_severity[f["severity"]].append(f)

    report = f"# Code Audit: {root}\n\n"
    report += f"- {len(findings)} findings "
    report += f"({len(by_severity['error'])} errors, "
    report += f"{len(by_severity['warning'])} warnings, "
    report += f"{len(by_severity['info'])} info)\n\n"

    for f in by_severity["error"]:
        report += f"- **{f['ruleId']}**: {f['message']} — `{f['file']}:{f['range']['start']['line']}`\n"

    return report
```

### 13.2 Pattern: "Auto-fix low-risk issues"

```python
def auto_fix_low_risk(root: str) -> dict:
    """Automatically fix info-severity issues with available fixes."""
    findings = scan_project(root)

    # Only fix info-level findings that have automatic fixes
    fixable = [f for f in findings
               if f["severity"] == "info" and f["hasFix"]]

    if not fixable:
        return {"fixed": 0, "message": "No low-risk fixes available"}

    # Generate diff
    diff = dry_run_fix(root, max_changes=len(fixable))

    # Apply
    result = apply_fix(root, max_changes=len(fixable))

    # Verify
    verify = run_target_tests(root)

    return {
        "fixed": len(fixable),
        "ruleIds": list({f["ruleId"] for f in fixable}),
        "diff": diff,
        "verify": verify,
    }
```

### 13.3 Pattern: "Check before merge"

```python
def pre_merge_check(root: str, base_branch: str) -> str:
    """Run scan on changed files only, block merge on errors."""
    changed_files = git_diff_files(base_branch)

    # Build include patterns for changed files only
    include = [f for f in changed_files if f.endswith((".ts", ".tsx"))]

    if not include:
        return "No scannable files changed"

    findings = scan_project(root, include=include)

    errors = [f for f in findings if f["severity"] == "error"]
    if errors:
        report = "## Merge blocked — scan errors found\n\n"
        for f in errors:
            report += f"- **{f['ruleId']}**: {f['message']} "
            report += f"(`{f['file']}:{f['range']['start']['line']}`)\n"
        return report

    return f"Pre-merge scan passed ({len(findings)} findings, 0 errors)"
```

### 13.4 Pattern: "Use structure map for architecture questions"

```python
def analyze_architecture(artifacts_dir: str) -> str:
    """Answer architecture questions using structure-map.json."""
    with open(f"{artifacts_dir}/structure-map.json") as f:
        sm = json.load(f)

    report = "# Architecture Analysis\n\n"

    # Route inventory
    if sm.get("routeDeclares"):
        report += f"## Routes ({len(sm['routeDeclares'])} declared)\n\n"
        for r in sm["routeDeclares"]:
            report += f"- `{r['method']} {r['path']}` → `{r['file']}`\n"

    # Import hotspots (most-imported files)
    if sm.get("structureImports"):
        import_counts = {}
        for imp in sm["structureImports"]:
            target = imp.get("target_path", imp.get("target"))
            if target:
                import_counts[target] = import_counts.get(target, 0) + 1

        top_imported = sorted(import_counts.items(), key=lambda x: -x[1])[:10]
        report += f"\n## Most-Imported Files\n\n"
        for path, count in top_imported:
            report += f"- `{path}` — {count} imports\n"

    # Experimental: call graph
    if sm.get("structuralSummary"):
        ss = sm["structuralSummary"]
        report += f"\n## Codebase Stats\n\n"
        report += f"- {ss['total_functions']} functions\n"
        report += f"- {ss['total_classes']} classes\n"
        report += f"- {ss['total_call_edges']} call edges\n"

    return report
```

---

## 14. Integration Checklist

Before deploying your agent integration:

### Setup
- [ ] los-ast installed (`npm install` in los-ast directory)
- [ ] At least one project adapter configured OR using `--root` mode
- [ ] Custom rules written for project-specific patterns (optional)
- [ ] For API mode: JWT secrets configured, `/healthz/ready` returns `"ready"`

### Safety
- [ ] Agent workflow enforces `scan → dry-run → review → apply → verify`
- [ ] `--max-changes` is set to a reasonable cap (start with 20)
- [ ] Agent never runs `--apply` without prior `--dry-run`
- [ ] Timeouts are configured for large codebases

### Output Consumption
- [ ] Agent parses JSONL findings correctly
- [ ] Agent handles empty results (no findings = success)
- [ ] Agent distinguishes `findingSource` channels (`ast` vs `contract` vs `schema`)
- [ ] Agent uses `fingerprint` for deduplication across scans

### Error Handling
- [ ] Agent handles CLI non-zero exit codes gracefully
- [ ] Agent checks `error.category` for API errors and acts accordingly
- [ ] Agent retries on `SERVICE_UNAVAILABLE` and `TIMEOUT`
- [ ] Agent reports `requestId` for debugging

### Verification
- [ ] Agent runs `npm run test:api:smoke` to verify API connectivity
- [ ] Agent runs `npm run test:lsclaw:adapter:artifacts` if consuming artifacts
- [ ] After applying fixes, agent runs target project's own test suite

---

## 15. Reference

| Document | Purpose |
|----------|---------|
| [API_USAGE.md](/API_USAGE.md) | Full HTTP API reference |
| [docs/API_CONTRACT.md](/docs/API_CONTRACT.md) | Stable API contract |
| [docs/ai/OUTPUT_SCHEMA.md](/docs/ai/OUTPUT_SCHEMA.md) | JSONL output schema |
| [docs/ai/AI_USAGE_GUIDE.md](/docs/ai/AI_USAGE_GUIDE.md) | AI-specific usage patterns |
| [docs/rules/RULE_AUTHORING.md](/docs/rules/RULE_AUTHORING.md) | How to write YAML rules |
| [docs/rules/RULE_TRACEABILITY.md](/docs/rules/RULE_TRACEABILITY.md) | Rule-to-finding traceability |
| [docs/adapters/lsclaw-artifact-contract.md](/docs/adapters/lsclaw-artifact-contract.md) | Artifact contract for downstream consumers |
| [docs/architecture.md](/docs/architecture.md) | Internal architecture |
| [AGENTS.md](/AGENTS.md) | Instructions for AI agents working ON los-ast itself |
