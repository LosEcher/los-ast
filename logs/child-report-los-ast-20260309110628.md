# los-ast Hub-Lite Artifacts Export Report

**Task**: Natural-completion validation for lsclaw hub-lite integration  
**Timestamp**: 2026-03-09T11:08:00+08:00  
**Trace ID**: trace-los-ast-complete-verify-20260309110628

## What Ran

```bash
npm run hub-lite:artifacts -- \
  --root ./fixtures/golden/lsclaw-sample \
  --project lsclaw \
  --include 'src/**/*.ts' \
  --output-dir ./logs/hub-lite-artifacts-20260309110628 \
  --deterministic
```

The command successfully scanned the lsclaw-sample fixture directory and exported analysis artifacts.

## Code Changes

**No code changes were made.** The export command performed a read-only scan of the fixture files.

## Verification Result

✅ **PASSED**

All required artifacts were generated successfully:

| Artifact | Path | Size |
|----------|------|------|
| scan-findings.jsonl | `./logs/hub-lite-artifacts-20260309110628/scan-findings.jsonl` | 4,237 bytes |
| symbols.json | `./logs/hub-lite-artifacts-20260309110628/symbols.json` | 785 bytes |
| structure-map.json | `./logs/hub-lite-artifacts-20260309110628/structure-map.json` | 2,845 bytes |

### Scan Summary
- **Files scanned**: 3
- **Findings**: 6
- **Symbols extracted**: 8
- **Imports found**: 5
- **Declarations**: 8
- **Route binds**: 0

## Limitation Notes

- `route_binds` is emitted as an empty array in first-pass export. This is a known limitation documented in the export tool.

## Conclusion

The hub-lite:artifacts export completed successfully without timeout. All required artifacts are present in the output directory.
