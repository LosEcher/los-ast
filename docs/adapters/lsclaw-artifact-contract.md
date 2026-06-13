# lsclaw Artifact Contract

## Stable Consumer Surface

`lsclaw` should treat the following `los-ast` artifacts as the current stable consumer surface:

- `scan-findings.jsonl`
- `symbols.json`
- `structure-map.json`

This contract freezes file names, top-level command semantics, and the minimum top-level fields listed below. It does not upgrade `structure-map.json` into full route truth.

## Stable Script Names

The following script names are part of the current `lsclaw` integration contract and should remain stable:

- `test:lsclaw:adapter:artifacts`
- `test:lsclaw:adapter:runtime`
- `test:lsclaw:adapter`

## Producer Command

Generate artifacts with:

```bash
npm run hub-lite:artifacts -- --root <workspace> --project lsclaw --include 'src/**/*.ts'
```

Notes:

- Default output directory: `<workspace>/logs/hub-lite-artifacts`
- Override output directory with `--output-dir <dir>`
- `--deterministic` is supported and should be used for contract smoke and golden-style verification

Dedicated contract smoke entry:

```bash
npm run test:lsclaw:adapter:artifacts
```

## Output Directory Contract

On successful command completion, the output directory must contain all three files:

- `scan-findings.jsonl`
- `symbols.json`
- `structure-map.json`

Current contract:

- Success means all three files are present.
- Missing one of the three files should be treated as contract failure.
- File names are stable and must not be silently renamed.

## Artifact Expectations

### `scan-findings.jsonl`

- JSON Lines output
- Each line is one scan finding
- Intended as the machine-readable finding stream for downstream filtering and ranking

### `symbols.json`

- JSON array output
- Each item describes one discovered symbol from the exported structure pass

### `structure-map.json`

`structure-map.json` is a structural evidence artifact, not a complete route-truth source.

The following top-level fields are part of the current stable contract and must be retained in stage one:

- `schema`
- `version`
- `project`
- `rootDir`
- `generatedAt`
- `source`
- `files`
- `symbols`
- `imports`
- `declares`
- `route_declares`
- `route_mounts`
- `route_binds`
- `route_runtime`
- `route_runtime_deltas`

The following `source` fields are also part of the stable contract:

- `tool`
- `mode`
- `scanArtifactPath`
- `symbolsArtifactPath`

## Route Evidence Boundary

`structure-map.json` is currently suitable for:

- structure inventory
- hotspot ranking
- boundary evidence
- minimal Fastify route declaration, mount, runtime, and delta layering
- minimal Fastify literal-only runtime-like bind evidence

`route_binds` currently provides minimal Fastify literal-only runtime-like bind evidence; it is not full route truth.

`structure-map.json` is not currently promised as:

- a complete route-truth authority
- a substitute for OpenAPI
- a substitute for integration tests
- a substitute for external runtime probes

`lsclaw` should continue to combine `structure-map.json` with OpenAPI, integration evidence, and runtime verification when route truth matters.

## Change Management

If `los-ast` changes any of the following, it must update this contract document and notify `lsclaw` to bump its pinned expectation:

- `hub-lite:artifacts` output file names
- `structure-map.json` top-level field names
- the three stable adapter smoke script names

Changes in this set should be treated as consumer-surface changes, not silent internal refactors.

## Recommended Verification Split

Keep the two checks separate:

- artifact contract: verify `scan-findings.jsonl`, `symbols.json`, `structure-map.json`
- runtime availability: verify `/healthz/live`, `/healthz/ready`, `/scan`, `/discover/symbols`

This separation avoids inferring runtime health from artifact generation alone.

Suggested commands:

```bash
npm run test:lsclaw:adapter:artifacts
npm run test:lsclaw:adapter:runtime
npm run test:lsclaw:adapter
```

## CI Status

Adding the adapter smoke to CI is recommended, but it is not a current release blocker for `lsclaw` integration.

## Consumer Version Pinning

To ensure reproducible artifact consumption, `lsclaw` should:

1. **Pin `@los-ast/core` version**: Use `"~1.x"` in `package.json` or a tested commit hash
2. **Validate `contractVersion`**: Before consuming artifacts, check `structure-map.json.version` matches the expected contract version
3. **Lock CI image**: Pin the `los-ast` Docker image (or Node.js + `@los-ast/core` version) in CI workflow

## Breaking Change Definition

The following changes are considered "breaking" for `lsclaw` consumers and require advance notification via this document:

- **Artifact file name changes**: Any rename of `scan-findings.jsonl`, `symbols.json`, or `structure-map.json`
- **Top-level field removal/rename** in `structure-map.json`: Removing or renaming fields listed in §Stable Consumer Surface
- **New required field in `/scan` request body without default**: The consumer's scan request payloads would break
- **Contract smoke script rename/removal**: The three `test:lsclaw:adapter:*` scripts are part of the contract

The following are NOT breaking and need no notification:

- Adding new optional fields to artifacts or API responses
- Adding new `ruleId` values (forward-compatible)
- Changing finding `severity` or `impactHint` within existing rules (semantic tuning)
- Internal refactors that do not change file names, field names, or script names

## Change Notification Protocol

When a breaking change is prepared:

1. Update this document (`lsclaw-artifact-contract.md`) with the new contract
2. Tag the commit message with `BREAKING(los-ast): <description>` or add `BREAKING` to the commit body
3. Bump the `contractVersion` in this document to reflect the new version
4. Notify `lsclaw` maintainers to update their pin

Non-breaking changes (new optional fields, new ruleIds, added parser profiles) do not require notification or contract version bump.
