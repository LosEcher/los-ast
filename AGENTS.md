# los-ast AGENTS

## Scope

This repo provides AST scanning, evidence export, and controlled code rewriting. Stable surfaces are the CLI, the documented artifact contracts, and the health/scan/discover APIs.

## Read Order

1. `docs/ACTIVE_TODO.md`
2. `README.md`
3. `docs/architecture.md`
4. Adapter docs under `docs/adapters/`

## Stability Rules

- Treat `packages/core` (including `scanner/` chunked map-reduce and `extraction/` Tree-sitter extractors), `packages/cli`, `GET /healthz/live`, `GET /healthz/ready`, `POST /scan`, and `POST /discover/symbols` as the primary stable surface.
- `--experimental-extractors` (call graph + import resolution) is stable code but feature-gated behind a flag; treat it as beta — the extraction output schema may evolve.
- Treat `experimental/*`, `vps-agent-web/*`, incident, approval, recovery, attribution, and memory-proposal areas as preview unless the task explicitly targets them.
- Prefer dry-run, JSONL output, and artifact verification before enabling a real write path.

## Key Commands

```bash
npm run los-ast -- scan --root /abs/path --include "src/**/*.ts" --format jsonl
npm run los-ast -- fix --project cantool --dry-run --max-changes 20
npm run build:api
npm run test
npm run quality-gate
```

Targeted validation:

```bash
npm run test:api:contract
npm run test:api:smoke
npm run test:lsclaw:adapter
```

## Preview Migration Plan

Preview 域组件的迁移状态：

| 组件 | 目标位置 | 时间线 | 状态 |
|------|----------|--------|------|
| `hotreload` | los-ast (保留) | 稳定 | 开发辅助，长期保留 |
| `evidence` | los-ast (保留) | 稳定 | 核心证据生成能力 |
| `memory-proposals` | los-memory | Milestone B | planned |
| `incident` | VPS Agent Web | Milestone B+ | planned |
| `attribution` | VPS Agent Web | Milestone B+ | planned |
| `recovery` | VPS Agent Web | Milestone B+ | planned |
| `approval` | VPS Agent Web | Milestone B+ | planned |

**Milestone B** (los-memory extraction): memory-proposals 迁移到独立的 los-memory 服务，los-ast 保留证据生成和 hotreload。
**Milestone B+** (VPS Agent Web extraction): incident/attribution/recovery/approval 迁移到 VPS Agent Web，los-ast 仅保留 scan/discover/evidence/hotreload 内核。

## Change Rules

- Do not widen stable-contract claims in docs unless tests and artifacts prove it.
- When touching an adapter contract, update the corresponding adapter doc and smoke/contract test in the same change.
- For rewrite behavior, preserve dry-run safety and explicit `--apply` gating.
- Prefer evidence-layer fixes over inference-heavy shortcuts.

## Validation

- CLI changes: run the narrowest relevant CLI command against a fixture or real root in dry-run mode.
- API changes: at least run the matching contract/smoke slice.
- Adapter changes: run the adapter-specific test entrypoint, not just generic tests.
- If a change affects `packages/api` runtime behavior or route wiring, refresh and verify `packages/api/dist`.
- If a change touches `/scan` contract truth or sync scripts, run `npm run check:scan-generated`.
