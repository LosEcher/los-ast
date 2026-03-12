<!-- @generated scan-api-contract-stability:begin -->
## Version Stability Guarantee

This v1 contract guarantees:

1. **Field Stability**: required response fields will not be removed
2. **Type Stability**: field types will not change in incompatible ways
3. **Error Stability**: error codes remain constant
4. **Backward Compatibility**: new optional fields may be added

Deprecation policy: Fields may be deprecated with 6-month notice before removal in v2.

## Deterministic Output

When `deterministic: true`, the API produces byte-for-byte reproducible output:

| Aspect | Behavior |
|--------|----------|
| JSON Keys | Sorted alphabetically (deep sort) |
| Findings Order | Sorted by file path, then line, then column |
| Timestamp | Fixed to Unix epoch (`1970-01-01T00:00:00.000Z`) |
| Fingerprint | Truncated to 32 characters |
| Output | Identical across multiple runs with same input |

When `deterministic: false`, real-time timestamps and full 64-character fingerprints are used.

## Testing

Contract tests verify CLI/API parity:

```typescript
// tests/contract/cli-api-parity.test.ts
// Verifies identical output structure between CLI and API
```

Run contract tests:
```bash
npm run test:api:contract
```
<!-- @generated scan-api-contract-stability:end -->
