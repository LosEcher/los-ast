# los-ast First-Run Integration Baseline Report

**Child Session**: los-ast-20260309063153  
**Trace ID**: trace-parent-epic-20260309063153  
**Parent Task**: epic-20260309063153  
**Date**: 2026-03-09  
**Status**: ACCEPTED

---

## Summary

Successfully froze los-ast to lsclaw first-run integration baseline around core `/scan` plus the lsclaw-sample golden fixture. All verification commands passed without errors.

---

## Verification Results

### 1. CLI Scan (Exit Code: 0)
```bash
node ./packages/cli/src/index.mjs scan --root ./fixtures/golden/lsclaw-sample --include 'src/**/*.ts' --format jsonl
```

**Result**: PASSED
- Files Scanned: 3 (src/config.ts, src/index.ts, src/router.ts)
- Findings Detected: 6 (all `lang.typescript.no-console-log`)
- Deterministic: Yes

### 2. Golden Case Tests (Exit Code: 0)
```bash
cd packages/api && npx vitest run tests/golden/golden-case.test.ts
```

**Result**: PASSED
- Tests: 7/7 passed
- Fixtures tested: mini-js, cantool-sample, lsclaw-sample

### 3. VPS Agent Web Routes Integration Tests (Exit Code: 0)
```bash
npx vitest run packages/api/tests/integration/vps-agent-web-routes.test.ts
```

**Result**: PASSED
- Tests: 5/5 passed
- Coverage: route registration, stats isolation, recovery attribution

### 4. TypeScript Type Check (Exit Code: 0)
```bash
cd packages/api && npm run typecheck
```

**Result**: PASSED
- Errors: 0
- Files checked: Core scan service and routes

### 5. Lsclaw Adapter Smoke Tests (Exit Code: 0)
```bash
cd packages/api && npx vitest run tests/smoke/lsclaw-adapter.smoke.test.ts
```

**Result**: PASSED
- Tests: 2/2 passed
- Coverage: /scan endpoint, /vps-agent-web/attribution/analyze endpoint

---

## Affected Files

| File | Status | Notes |
|------|--------|-------|
| `fixtures/golden/lsclaw-sample/` | Verified | Golden fixture with 3 TS files |
| `fixtures/golden/lsclaw-sample/expected-output.json` | Verified | Expected findings spec |
| `packages/api/tests/golden/golden-case.test.ts` | Passed | Golden case test suite |
| `packages/api/tests/integration/vps-agent-web-routes.test.ts` | Passed | Integration tests |
| `packages/api/tests/smoke/lsclaw-adapter.smoke.test.ts` | Passed | Smoke tests for lsclaw adapter |
| `packages/api/src/routes/core/scan.ts` | Verified | Core scan endpoint implementation |
| `packages/api/src/services/scan-service.ts` | Verified | Scan service with limits and validation |
| `docs/lsclaw-integration-execution-plan.md` | Reviewed | T1/T2/T3 execution plan |
| `docs/adapters/lsclaw.md` | Reviewed | Adapter documentation |

---

## Evidence Bundle

```json
{
  "schemaVersion": "v0",
  "generator": "los-ast",
  "deterministic": true,
  "filesScanned": 3,
  "findingsCount": 6,
  "findingsTypes": ["lang.typescript.no-console-log"]
}
```

---

## Cross-Repo Contract Assessment

**Changes Required**: NO  
**Cross-Repo Contract Changes Required**: NO

The los-ast repo successfully validated against its own test suite without requiring any changes to other repo interfaces. The core `/scan` endpoint and lsclaw-sample golden fixture are stable and ready for downstream consumption.

---

## Blockers

None. All verification passed.

---

## Metrics

| Metric | Value |
|--------|-------|
| Tests Passed | 14/14 (100%) |
| Tests Failed | 0 |
| Type Errors | 0 |
| Files Scanned | 3 |
| Findings Detected | 6 |
| Exit Codes (all) | 0 |

---

## Acceptance Criteria Status

| Criteria | Status |
|----------|--------|
| Parent and child sessions visible with stable ordering | MET |
| Child emits execution/progress records | MET |
| Child emits result records | MET |
| Verification commands recorded with exit codes | MET |
| Artifact paths referenced | MET |
| No blockers - baseline frozen | MET |

---

## Next Steps

1. Parent session to aggregate results from all 4 child sessions
2. Review for any cross-repo contract blockers at parent level
3. Finalize hub-lite parent epic acceptance

---

## Report Location

- `logs/hub-lite-parent-epic-dispatch-20260309063153.json`
