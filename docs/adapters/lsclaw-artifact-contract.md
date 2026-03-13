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
