# Module Topology & Hotspot Report

Generated: 2026-06-13. Regenerate by re-running `npm run check:module-sizes` and inspecting `package.json` dependency fields.

## Cross-Package Dependency Graph

```
                          +-----------+
                          |  @los-ast |
                          |  /shared  |  (leaf — zero dependencies)
                          +-----------+
                                ^
                                |
          +------------------+--+----------------+----------------+
          |                  |                   |                |
     +----+-----+     +-----+----+     +-------+------+     +---+--+
     | @los-ast |     |  @los-ast |     |  @los-ast    |     |@los- |
     |   /core  |     |  /adapters|     |     /api     |     |ast/ai|
     |          |     |           |     | (hub package)|     |(leaf)|
     +----------+     +-----+-----+     +-------+------+     +------+
          ^                  |                   |
          |            +-----+----+              |
          +------------| @los-ast |<-------------+
                       |  /rules  |
                       +----------+
```

**Dependency direction (by package.json):**
- `@los-ast/shared` → nothing (leaf)
- `@los-ast/core` → external only: `@ast-grep/napi`, `@ast-grep/lang-rust` (no `@los-ast/*` deps)
- `@los-ast/adapters` → `@los-ast/rules`
- `@los-ast/ai` → nothing (leaf, zero dependencies)
- `@los-ast/cli` → `@los-ast/core`, `@los-ast/adapters`
- `@los-ast/api` → `@los-ast/core`, `@los-ast/adapters`, `@los-ast/ai`, `@los-ast/rules`, `@los-ast/shared`

**No circular dependencies detected.** All packages form a DAG.

## Dependency Heatmap (by import count)

| Rank | Package | Cross-package dependents |
|------|---------|-------------------------|
| 1 | `@los-ast/shared` | 1 (api) |
| 2 | `@los-ast/core` | 2 (cli, api) |
| 3 | `@los-ast/adapters` | 2 (cli, api) |
| 4 | `@los-ast/rules` | 1 (adapters) |
| 5 | `@los-ast/ai` | 1 (api) |

## Large Files (>400 lines)

As of 2026-06-13, after the discriminator-extraction and comparator-extraction splits:

| Lines | File | Package | Status |
|-------|------|---------|--------|
| 643 | `services/openapi-artifacts.ts` | api | **exception** — pure orchestration after split |
| 464 | `persistence/repositories/recovery-repository.ts` | api | **warn** — preview-migration-bound |
| 449 | `services/memory/store.ts` | api | **warn** — preview-migration-bound (→ los-memory) |
| 447 | `routes/core/scan-doc-contract/shared.ts` | api | **warn** — reference module |
| 403 | `services/schema-artifacts/shared/comparator.ts` | api | **exception** — pure helper functions |

**Key takeaway:** The largest non-exception warnings are in preview-bound modules (recovery-repository, memory/store) that will migrate to VPS Agent Web / los-memory per the preview migration plan.

## Dependency Direction Rules

Aligned with `docs/architecture-boundary-spec.md`:

1. **No upward imports**: `core` must not import from `cli` or `api`; `cli` must not import from `api`.
2. **Shared is leaf**: `@los-ast/shared` must not depend on any `@los-ast/*` package.
3. **Adapter isolation**: `adapters` must only depend on `rules`, never on `core`/`api`/`cli`.
4. **API is hub**: `api` may depend on all other packages. It acts as the integration surface.
5. **CLI+Core extraction coupling**: `cli` currently imports `core/src/extraction` internals via deep paths. This should eventually be gated behind a proper `@los-ast/core` extraction API export.

## Hotspot Strategy

Files currently above the 400-line warning threshold fall into two categories:

1. **Preview-migration-bound** (recovery-repository, memory/store): Do not split further — these modules will be extracted from los-ast entirely (see `AGENTS.md` Preview Migration Plan, Milestone B/B+).

2. **Reference module** (scan-doc-contract/shared.ts): Contains generated reference data. Acceptable at current size; evaluate splitting only if content (not template length) grows.

3. **Orchestration modules** (openapi-artifacts.ts, comparator.ts): Already split. The remaining line count is legitimate coordination logic, not mixed concerns.

## Follow-up

- Run `npm run check:module-sizes` after each significant PR to prevent drift.
- When preview migration (Milestone B/B+) completes, three warnings will drop automatically.
