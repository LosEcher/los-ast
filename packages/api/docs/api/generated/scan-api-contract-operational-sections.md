<!-- @generated scan-api-contract-ops:begin -->
type ErrorCategory =
  | 'VALIDATION'
  | 'SCOPE'
  | 'AUTHENTICATION'
  | 'TIMEOUT'
  | 'SCAN_TOO_LARGE'
  | 'NOT_FOUND'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL';

### Error Code Reference

| HTTP Status | Category | Code | Description |
|-------------|----------|------|-------------|
| 400 | VALIDATION | `INVALID_PROJECT` | Project field missing or invalid |
| 400 | VALIDATION | `INVALID_SCAN_INPUT` | Neither `rootDir` nor any native contract/schema input set was provided |
| 400 | VALIDATION | `INVALID_ROOTDIR` | rootDir field missing or invalid when the request implies AST/code scanning |
| 401 | AUTHENTICATION | `MISSING_JWT` / `INVALID_JWT` / `JWT_EXPIRED` / `UNVERIFIED_IDENTITY_DISABLED` | Identity or JWT verification failed when the identity plugin is enforced |
| 403 | SCOPE | `SCOPE_ERROR` | Scope/permission issue |
| 404 | NOT_FOUND | `RESOURCE_NOT_FOUND` | Requested resource not found |
| 404 | NOT_FOUND | `ROUTE_NOT_FOUND` | API endpoint not found |
| 408 | TIMEOUT | `REQUEST_TIMEOUT` | Scan exceeded time limit |
| 413 | SCAN_TOO_LARGE | `SCAN_TOO_LARGE` | Response size exceeds limit |
| 500 | INTERNAL | `INTERNAL_ERROR` | Unexpected server error |
| 500 | INTERNAL | `UNKNOWN_ERROR` | Unknown error type |
| 503 | SERVICE_UNAVAILABLE | `CORE_NOT_READY` | Core is not ready, explicit fallback path |

Authentication note: when the identity plugin is enforced, `/scan` may also surface additional `401 AUTHENTICATION` codes from JWT or local identity verification.

## Limits and Constraints

| Constraint | Value | Description |
|------------|-------|-------------|
| Max Files (Sync) | 1000 | Maximum files per synchronous scan |
| Response Size | 10MB | Maximum JSON response size |
| Timeout | 30s | Maximum scan duration |
| Excerpt Length | 240 chars | Default maximum finding excerpt length |
| Cache Entries | 128 | Default parse cache capacity exposed by `parseCache.maxEntries` |
| Parse Failure Samples | 20 | Maximum parse failure samples included when `includeStats=true` |
<!-- @generated scan-api-contract-ops:end -->
