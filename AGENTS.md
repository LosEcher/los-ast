# los-ast AGENTS

## Scope

This repo provides AST scanning, evidence export, and controlled code rewriting. Stable surfaces are the CLI, the documented artifact contracts, and the health/scan/discover APIs.

## Read Order

1. `docs/ACTIVE_TODO.md`
2. `README.md`
3. `docs/architecture.md`
4. Adapter docs under `docs/adapters/`

## Stability Rules

- Treat `packages/core`, `packages/cli`, `GET /healthz/live`, `GET /healthz/ready`, `POST /scan`, and `POST /discover/symbols` as the primary stable surface.
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
