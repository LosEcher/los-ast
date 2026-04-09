# los-ast Identity/Scope Hardening & Evidence-Signing Implementation Plan

**Status:** Analysis & Planning Complete  
**Scope:** Bounded implementation - identity/scope hardening, evidence signing, request context propagation  
**Non-Goals:** No code changes in this round; no unrelated parser/shared refactors; no preview route changes except migration ownership assignment

---

## 1. Current State Assessment

### 1.1 Identity & Scope (✅ Mostly Implemented)

| Component | Status | Location |
|-----------|--------|----------|
| JWT verification plugin | ✅ Implemented | `packages/api/src/plugins/identity.ts` |
| Scope validation plugin | ✅ Implemented | `packages/api/src/plugins/scope-validator.ts` |
| VerifiedScope type | ✅ Defined | `packages/shared/src/types/api.ts` |
| Production JWT enforcement | ✅ Implemented | `identity.ts` + `scope-validator.ts` |
| SCOPE_TAMPERED detection | ✅ Implemented | `identity.ts:74-96` |
| Unit tests (dev mode) | ✅ Exists | `packages/api/tests/unit/plugins/identity.test.ts` |
| Unit tests (production) | ✅ Exists | `packages/api/tests/unit/plugins/identity-production.test.ts` |

**Key Gaps:**
- `trace_id` not propagated from request headers
- `role` field missing from `IdentityContext`
- Fastify type declarations use loose `Scope` instead of `VerifiedScope`

### 1.2 Evidence Signing (⚠️ Partially Implemented)

| Component | Status | Location |
|-----------|--------|----------|
| EvidenceSignature type | ✅ Defined | `packages/shared/src/types/evidence.ts:8-14` |
| Bundle signature field | ✅ Optional field | `packages/shared/src/types/evidence.ts:42` |
| Signing function | ✅ Implemented | `packages/api/src/services/evidence/service.ts:81-109` |
| HMAC-SHA256 algorithm | ✅ Implemented | `service.ts:98-99` |
| Verification path | ❌ Missing | No verify function exists |
| Full bundle coverage | ⚠️ Partial | Signs metadata only, not full bundle |

**Key Gaps:**
- No `verifyEvidenceSignature()` function
- Signature doesn't cover full bundle content (findings, snippets, etc.)
- No key rotation support (single `EVIDENCE_SIGNING_KEY`)

### 1.3 Request Context Propagation (⚠️ Needs Enhancement)

| Field | Status | Location |
|-------|--------|----------|
| request_id | ✅ Generated + stored | `request-id.ts` plugin |
| request_id response header | ✅ Set | `request-id.ts:21` |
| trace_id | ❌ Not extracted | Not implemented |
| actor_id | ✅ In VerifiedScope | `api.ts:13-20` |
| role | ❌ Missing | Not in IdentityContext |
| identity_source | ✅ Implemented | `identity.ts:11-17` |

### 1.4 Stable vs Preview Surface (✅ Well Documented)

**Stable Surface (P0):**
- `GET /healthz/live`, `GET /healthz/ready`
- `POST /scan`
- `POST /discover/symbols`

**Preview Surface (Migration Target):**
- `/experimental/*` (incident, approval, recovery, memory, evidence, attribution)
- `/vps-agent-web/*` (approvals, incidents, attribution, recovery)

**Migration Ownership (from four-project-collaboration-todo.md):**
- `incident/approval/recovery` → VPS Agent Web (control plane)
- `attribution` provider governance → lsclaw
- `los-ast` keeps: scan, discover, evidence generation (facts only)

---

## 2. Implementation Boundaries

### 2.1 In Scope

1. **Type System Hardening**
   - Update `packages/shared/src/types/api.ts` with enhanced request context types
   - Update `packages/api/src/types/index.ts` Fastify declarations for `VerifiedScope`
   - Add `role` to `IdentityContext` and `VerifiedScope`
   - Add `trace_id` to request context

2. **Plugin Enhancements**
   - `request-id.ts`: Add `trace_id` extraction from `X-Trace-ID` header
   - `identity.ts`: Add `role` extraction from JWT claims
   - `scope-validator.ts`: No changes needed (already derives from identity)

3. **Evidence Signing Completion**
   - `packages/shared/src/types/evidence.ts`: Add verification fields
   - `packages/api/src/services/evidence/builders.ts`: Enhance signature coverage
   - `packages/api/src/services/evidence/service.ts`: Add `verifyEvidenceBundle()`

4. **Stable Contract Cleanup**
   - `packages/api/src/routes/core/discover/shared.ts`: Update to use `VerifiedScope`
   - Document preview route migration ownership

5. **First Consumer Route**
   - `packages/api/src/routes/experimental/evidence.ts`: Implement verify-on-read for GET /:id

### 2.2 Out of Scope

1. **No Preview Route Refactoring**
   - Do not modify `/experimental/*` routes except evidence.ts GET endpoint
   - Do not modify `/vps-agent-web/*` routes
   - Migration ownership documented only, not executed

2. **No Unrelated Shared Refactors**
   - No changes to `openapi-artifacts/shared.ts` beyond type imports
   - No changes to `schema-artifacts/shared.ts` beyond type imports
   - No changes to `route-guard-analysis/*`

3. **No CLI Changes**
   - No changes to `export-artifacts.mjs`
   - No changes to `source-structure-extractor.mjs`

---

## 3. Implementation Sequence

### Phase 1: Type Foundation (Files 1-2)

**File 1: `packages/shared/src/types/api.ts`**
```typescript
// Add to existing VerifiedScope
export interface VerifiedScope {
  tenant_id: string;
  project_id: string;
  actor_id: string;
  mode: 'local' | 'service';
  identity_verified: boolean;
  identity_source: 'jwt' | 'service_token' | 'local_dev';
  role?: string; // NEW
}

// NEW: Request context for propagation
export interface RequestContext {
  request_id: string;
  trace_id?: string;
  actor_id: string;
  role?: string;
  identity_source: 'jwt' | 'service_token' | 'local_dev';
  tenant_id: string;
  project_id: string;
}
```

**File 2: `packages/api/src/types/index.ts`**
```typescript
// Update Fastify declarations
declare module 'fastify' {
  interface FastifyRequest {
    scope?: VerifiedScope; // Changed from loose Scope
    requestId: string;
    traceId?: string; // NEW
  }
}
```

### Phase 2: Plugin Enhancements (Files 3-4)

**File 3: `packages/api/src/plugins/request-id.ts`**
- Extract `X-Trace-ID` header if present
- Store in `request.traceId`
- Return in response header `X-Trace-ID`

**File 4: `packages/api/src/plugins/identity.ts`**
- Extract `role` claim from JWT payload
- Add to `IdentityContext` and `VerifiedScope`
- No changes to verification logic

### Phase 3: Evidence Types (File 5)

**File 5: `packages/shared/src/types/evidence.ts`**
```typescript
// Enhance EvidenceSignature
export interface EvidenceSignature {
  algorithm: 'hmac-sha256' | 'ed25519' | 'none';
  value: string;
  key_id?: string;
  signed_at: string;
  signed_by: string;
  // NEW: Verification metadata
  scope: {
    tenant_id: string;
    project_id: string;
  };
  request_id: string;
  trace_id?: string;
}

// NEW: Verification result
export interface EvidenceVerificationResult {
  valid: boolean;
  algorithm: string;
  signed_at: string;
  signed_by: string;
  scope_match: boolean;
  tampered_fields?: string[];
}
```

### Phase 4: Evidence Service (Files 6-7)

**File 6: `packages/api/src/services/evidence/builders.ts`**
- Update `buildEvidenceBundle()` to accept `RequestContext`
- Include `request_id`, `trace_id` in signature payload
- Sign full bundle hash, not just metadata

**File 7: `packages/api/src/services/evidence/service.ts`**
- Add `verifyEvidenceBundle()` function
- Verify HMAC signature
- Compare scope in signature vs bundle scope
- Return `EvidenceVerificationResult`

### Phase 5: Route Integration (File 8)

**File 8: `packages/api/src/routes/experimental/evidence.ts`**
- GET `/:id` endpoint: Call `verifyEvidenceBundle()` before returning
- Return 403 if signature verification fails
- Return bundle with `verification` field

### Phase 6: Stable Contract (File 9)

**File 9: `packages/api/src/routes/core/discover/shared.ts`**
- Update imports to use `VerifiedScope`
- No functional changes needed (already uses scope correctly)

---

## 4. Test Plan

### 4.1 Unit Tests (Already Exist - Baseline)

| Test File | Coverage | Status |
|-----------|----------|--------|
| `identity.test.ts` | Dev mode, JWT validation, scope derivation | ✅ Pass |
| `identity-production.test.ts` | Production enforcement, SCOPE_TAMPERED | ✅ Pass |
| `scope-validator.test.ts` | Scope extraction, validation | ✅ Pass |
| `request-id.test.ts` | Request ID generation | ✅ Pass |

### 4.2 New Test Coverage Needed

**Identity Plugin Tests:**
- `trace_id` extraction from header
- `role` extraction from JWT claims
- `trace_id` response header

**Evidence Service Tests:**
- Signature covers full bundle
- `verifyEvidenceBundle()` returns valid for good signature
- `verifyEvidenceBundle()` returns invalid for tampered bundle
- `verifyEvidenceBundle()` detects scope mismatch

**Evidence Route Tests:**
- GET `/:id` returns 403 for invalid signature
- GET `/:id` includes verification metadata

### 4.3 Integration Tests

**API Contract/Smoke Tests:**
- Evidence write with signature, read with verification
- All write paths use `actor_id` from verified scope (not body)
- Preview routes prove `actor_id`/`trace_id`/`request_id` come from request metadata

---

## 5. Configuration Requirements

### 5.1 Environment Variables (Already Exist)

| Variable | Purpose | Status |
|----------|---------|--------|
| `JWT_SECRET` / `LSCLAW_JWT_SECRET` | JWT verification | ✅ Implemented |
| `EVIDENCE_SIGNING_KEY` | Evidence HMAC signing | ✅ Implemented |
| `DEV_ALLOW_UNVERIFIED_IDENTITY` | Dev mode unverified bypass | ✅ Implemented |
| `ENABLE_EXPERIMENTAL_ROUTES` | Toggle experimental routes | ✅ Implemented |

### 5.2 No New Variables Required

All necessary configuration already exists. No additions needed.

---

## 6. Migration Ownership Documentation

### 6.1 Preview Route Migration (Document Only)

| Route Group | Current Location | Target Owner | Migration Status |
|-------------|------------------|--------------|------------------|
| incidents | `/experimental/incidents`, `/vps-agent-web/incidents` | VPS Agent Web | Documented, not executed |
| approvals | `/experimental/approvals`, `/vps-agent-web/approvals` | VPS Agent Web | Documented, not executed |
| recovery | `/experimental/recovery`, `/vps-agent-web/recovery` | VPS Agent Web | Documented, not executed |
| attribution | `/experimental/attribution`, `/vps-agent-web/attribution` | lsclaw (provider governance) | Documented, not executed |
| memory-proposals | `/experimental/memory-proposals` | los-memory | Documented, not executed |
| evidence | `/experimental/evidence` | **los-ast keeps** (facts only) | Stable commitment |

### 6.2 los-ast Stable Commitment

**Keeps:**
- `POST /scan` - Code scanning
- `POST /discover/symbols` - Symbol discovery
- `POST /experimental/evidence/generate` - Evidence generation (signing)
- `GET /experimental/evidence/:id` - Evidence retrieval (with verification)

**Migrates Away (control plane):**
- Incident management
- Approval workflows
- Recovery orchestration
- Attribution provider governance
- Memory proposal workflows

---

## 7. Acceptance Criteria

### 7.1 Identity & Scope

- [ ] `request.scope` is always `VerifiedScope` after identity plugin
- [ ] `trace_id` extracted from `X-Trace-ID` and propagated
- [ ] `role` extracted from JWT and available in scope
- [ ] Production mode rejects requests without valid JWT
- [ ] SCOPE_TAMPERED detected when client scope != JWT claims

### 7.2 Evidence Signing

- [ ] Evidence bundles include signature with full coverage
- [ ] Signature includes `request_id`, `trace_id`, scope
- [ ] `verifyEvidenceBundle()` function exists and works
- [ ] GET evidence endpoint verifies signature before returning
- [ ] Verification failures return 403 with tampered fields listed

### 7.3 Request Context

- [ ] All requests have `requestId` (generated or from header)
- [ ] All requests have `traceId` (from header or undefined)
- [ ] Response headers include `X-Request-ID` and `X-Trace-ID`
- [ ] `actor_id` in evidence comes from `request.scope` (verified)

### 7.4 Stable Surface

- [ ] `/scan` and `/discover/symbols` use `VerifiedScope`
- [ ] No body/query scope trusted for write operations
- [ ] Preview routes documented with migration ownership

---

## 8. Risk Mitigation

### 8.1 Backward Compatibility

**Risk:** Changing `request.scope` type may break existing code  
**Mitigation:** `VerifiedScope` is stricter subset of `Scope`; existing property access continues to work

**Risk:** Evidence signature format change breaks existing bundles  
**Mitigation:** Signature is additive (optional field); old bundles without signature still valid

**Risk:** `trace_id` requirement breaks clients not sending it  
**Mitigation:** `trace_id` is optional; absence doesn't fail request

### 8.2 Performance

**Risk:** Full bundle signing is expensive for large findings  
**Mitigation:** Sign hash of canonical JSON, not full content; async signing

**Risk:** Verification on every read adds latency  
**Mitigation:** Verification is fast HMAC compare; optional caching

---

## 9. Implementation Checklist

### Phase 1: Types (Week 1)
- [ ] Update `packages/shared/src/types/api.ts`
- [ ] Update `packages/api/src/types/index.ts`
- [ ] Run type check: `npm run check:api-dist`

### Phase 2: Plugins (Week 1)
- [ ] Update `packages/api/src/plugins/request-id.ts`
- [ ] Update `packages/api/src/plugins/identity.ts`
- [ ] Run plugin tests: `npm run test:unit:plugins`

### Phase 3: Evidence (Week 2)
- [ ] Update `packages/shared/src/types/evidence.ts`
- [ ] Update `packages/api/src/services/evidence/builders.ts`
- [ ] Update `packages/api/src/services/evidence/service.ts`
- [ ] Add evidence verification tests

### Phase 4: Routes (Week 2)
- [ ] Update `packages/api/src/routes/experimental/evidence.ts`
- [ ] Update `packages/api/src/routes/core/discover/shared.ts`
- [ ] Run smoke tests: `npm run test:smoke`

### Phase 5: Documentation (Week 3)
- [ ] Update API_CONTRACT.md with new headers
- [ ] Update OpenAPI with trace_id, role fields
- [ ] Document migration ownership in ARCHITECTURE.md

### Phase 6: Validation (Week 3)
- [ ] Full test suite: `npm run quality-gate`
- [ ] Build and dist check: `npm run build:api && npm run check:api-dist`
- [ ] Scan generated check: `npm run check:scan-generated`

---

## 10. References

- Current identity plugin: `packages/api/src/plugins/identity.ts`
- Current scope validator: `packages/api/src/plugins/scope-validator.ts`
- Evidence types: `packages/shared/src/types/evidence.ts`
- Evidence service: `packages/api/src/services/evidence/service.ts`
- Four project collaboration: `docs/four-project-collaboration-todo.md`
- VPS Agent Web contract: `docs/api/vps-agent-web-contract-checklist.md`
- Active TODO: `docs/ACTIVE_TODO.md`

---

**Plan Version:** 1.0  
**Created:** 2026-04-06  
**Next Step:** Review and approve plan, then proceed to Phase 1 implementation
