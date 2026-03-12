<!-- @generated scan-api-contract:begin -->
### Body

```typescript
interface ScanRequest {
  scope?: Scope;
  project: string;
  rootDir?: string;
  include?: string[];
  ignore?: string[];
  rules?: string[];
  rulePack?: string;
  includeStats?: boolean;
  deterministic?: boolean;
  openApiDocuments?: unknown[];
  openApiComparisons?: unknown[];
  schemaDocuments?: unknown[];
  schemaComparisons?: unknown[];
  contractArtifacts?: unknown[];
  schemaArtifacts?: unknown[];
}
```

#### Field Descriptions

| Field | Required | Notes |
|-------|----------|-------|
| `scope` | No | Compatibility context object; production identity should be derived from verified auth, not trusted as the sole source |
| `project` | Yes | Stable request identifier for the scan target |
| `rootDir` | Conditional | Required only when the request implies AST/code scanning; native-only inputs may omit it |
| `include` | No | Optional scan request field |
| `ignore` | No | Optional scan request field |
| `rules` | No | Optional scan request field |
| `rulePack` | No | Optional scan request field |
| `includeStats` | No | Enables `parseCache`, `parseFailures`, and `scanTelemetry` in the response |
| `deterministic` | No | Optional stable output mode; current default is `false` |
| `openApiDocuments` | No | Native governance input channel; may be supplied without `rootDir` |
| `openApiComparisons` | No | Native governance input channel; may be supplied without `rootDir` |
| `schemaDocuments` | No | Native governance input channel; may be supplied without `rootDir` |
| `schemaComparisons` | No | Native governance input channel; may be supplied without `rootDir` |
| `contractArtifacts` | No | Native governance input channel; may be supplied without `rootDir` |
| `schemaArtifacts` | No | Native governance input channel; may be supplied without `rootDir` |

When `rootDir` is omitted, the request must provide at least one native input set: `openApiDocuments`, `openApiComparisons`, `schemaDocuments`, `schemaComparisons`, `contractArtifacts`, `schemaArtifacts`.

## Response Schema

### Success (200 OK)

```typescript
interface ScanResponse {
  data: {
    filesScanned: number;
    findings: Finding[];
    parseCache?: unknown;
    parseFailures?: unknown;
    scanTelemetry?: unknown;
  };
}
```

Current `data` properties:

- `filesScanned`
- `findings`
- `parseCache`
- `parseFailures`
- `scanTelemetry`
<!-- @generated scan-api-contract:end -->
