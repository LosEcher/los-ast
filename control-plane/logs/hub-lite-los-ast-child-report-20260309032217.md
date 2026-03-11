# los-ast Child Report - Baseline Freeze

**Task ID**: los-ast-20260309022833  
**Parent Task ID**: epic-20260309022833  
**Trace ID**: trace-parent-epic-20260309022833  
**Session ID**: child-los-ast-20260309022833  
**Owner Repo**: los-ast  
**Generated**: 2026-03-09T03:23:00Z  

---

## Summary

Los-ast baseline freeze for lsclaw first-run integration completed successfully. Core `/scan` functionality and evidence fields are stable. All verification commands pass with no contract issues requiring cross-repo changes.

**Acceptance State**: ✅ PASSED  
**Cross-Repo Contract Change Required**: No  

---

## Execution Records

### 1. Verification Commands Executed

#### Scan Command
```bash
cd /Users/echerlos/Downloads/projects/los-ast && \
node ./packages/cli/src/index.mjs scan \
  --root ./fixtures/golden/lsclaw-sample \
  --include 'src/**/*.ts' \
  --format jsonl
```

**Result**: ✅ PASSED (Exit Code 0)  
**Findings**: 6 console.log warnings across 3 files  
**Files Scanned**: 3 (src/index.ts, src/router.ts, src/config.ts)  
**Deterministic**: Yes (fingerprints stable)

#### Golden Case Tests
```bash
cd /Users/echerlos/Downloads/projects/los-ast/packages/api && \
npx vitest run tests/golden/golden-case.test.ts
```

**Result**: ✅ PASSED (7/7 tests)  
- mini-js: deterministic output verified
- cantool-sample: deterministic output verified  
- lsclaw-sample: deterministic output verified (6 findings, 3 files)

#### Integration Tests
```bash
cd /Users/echerlos/Downloads/projects/los-ast && \
npx vitest run packages/api/tests/integration/vps-agent-web-routes.test.ts
```

**Result**: ✅ PASSED (5/5 tests)  
- Scope isolation across incidents/recovery/attribution verified
- VPS Agent Web routes functional

#### Typecheck
```bash
cd /Users/echerlos/Downloads/projects/los-ast/packages/api && \
npm run typecheck
```

**Result**: ✅ PASSED (no errors)

#### Full Test Suite
```bash
cd /Users/echerlos/Downloads/projects/los-ast/packages/api && \
npx vitest run
```

**Result**: ✅ PASSED (105/105 tests across 13 test files)

---

## Affected Files

### Core Scan Stability
- `packages/api/src/routes/core/scan.ts` - Route handler stable
- `packages/api/src/services/scan-service.ts` - Service implementation stable
- `packages/core/src/runner.mjs` - Core scan logic with deterministic sorting

### Evidence Contract (T2 Compliance)
- `packages/shared/src/types/evidence.ts` - Type definitions with schema_version, generator, deterministic fields
- `packages/api/src/services/evidence/service.ts` - Service properly sets all contract fields:
  - `schema_version: '1.0.0'`
  - `generator: { tool: 'los-ast', version: '1.0.0' }`
  - `deterministic: boolean`

### Golden Fixtures
- `fixtures/golden/lsclaw-sample/` - Sample project with expected findings
  - src/index.ts (3 console.log statements)
  - src/router.ts (2 console.log statements)
  - src/config.ts (1 console.log statement)
  - expected-output.json (contract verified)

### Tests
- `packages/api/tests/golden/golden-case.test.ts` - Golden case validation
- `packages/api/tests/integration/vps-agent-web-routes.test.ts` - Integration tests
- `packages/api/tests/integration/experimental-routes.test.ts` - Evidence API contract tests
- `packages/api/tests/integration/determinism.test.ts` - Deterministic output tests
- `packages/api/tests/smoke/lsclaw-adapter.smoke.test.ts` - Smoke tests for lsclaw integration

---

## Blockers

**None identified.**

All contracts are stable within los-ast scope. No cross-repo interface changes required.

---

## Artifacts Generated

| Artifact | Path | Status |
|----------|------|--------|
| Scan Summary | fixtures/golden/lsclaw-sample/expected-output.json | ✅ Verified |
| Golden Test Results | packages/api/tests/golden/golden-case.test.ts | ✅ 7/7 pass |
| Integration Results | packages/api/tests/integration/ | ✅ 22/22 pass |
| Typecheck | packages/api/tsconfig.json | ✅ Clean |
| Evidence Contract | packages/api/src/services/evidence/service.ts | ✅ T2 Compliant |
| Child Report | control-plane/logs/hub-lite-los-ast-child-report-20260309005606.md | ✅ Generated |

---

## Evidence Fields Verification

Per T2 (evidence contract固化) requirements:

| Field | Type | Status | Location |
|-------|------|--------|----------|
| schema_version | string | ✅ Set to '1.0.0' | evidence/service.ts:92 |
| generator.tool | 'los-ast' | ✅ Set | evidence/service.ts:94 |
| generator.version | string | ✅ Set to '1.0.0' | evidence/service.ts:95 |
| deterministic | boolean | ✅ Set from request | evidence/service.ts:97 |

Test verification in `experimental-routes.test.ts:216-219`:
```typescript
expect(body.data.schema_version).toBe('1.0.0');
expect(body.data.generator.tool).toBe('los-ast');
expect(body.data.generator.version).toBeDefined();
expect(body.data.deterministic).toBe(true);
```

---

## Next Steps / Recommendations

1. **No action required** - los-ast baseline is frozen and stable
2. **Sibling repos** can proceed with integration using current scan/evidence contracts
3. **Hub-lite control plane** can aggregate results from this child session
4. **Future work** (out of scope):
   - T3 documentation updates if needed
   - Provider-specific rule packs
   - Performance optimizations for large repos

---

## Child Session Metadata

```json
{
  "taskId": "los-ast-20260309022833",
  "parentTaskId": "epic-20260309022833",
  "traceId": "trace-parent-epic-20260309022833",
  "sessionId": "child-los-ast-20260309022833",
  "ownerRepo": "los-ast",
  "targetProjectPath": "/Users/echerlos/Downloads/projects/los-ast",
  "stage": "implementation",
  "role": "writer",
  "status": "completed",
  "acceptance": "passed",
  "blockers": [],
  "artifacts": 6,
  "testsPassed": 105,
  "testsTotal": 105
}
```
