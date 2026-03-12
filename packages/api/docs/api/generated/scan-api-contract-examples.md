<!-- @generated scan-api-contract-examples:begin -->
### Example Request

```json
{
  "scope": {
    "tenant_id": "org_123",
    "project_id": "myapp",
    "actor_id": "user_456",
    "mode": "service"
  },
  "project": "myapp",
  "rootDir": "/workspace/myapp",
  "include": [
    "src/**/*.ts"
  ],
  "ignore": [
    "**/*.spec.ts",
    "node_modules/**"
  ],
  "includeStats": true,
  "deterministic": true
}
```

### Example Success Response

```json
{
  "data": {
    "filesScanned": 42,
    "findings": [
      {
        "tool": "los-ast",
        "version": 1,
        "timestamp": "2026-03-13T00:00:00.000Z",
        "project": "myapp",
        "ruleFile": "rules/languages/typescript/no-console.yml",
        "ruleId": "typescript/no-console",
        "findingSource": "ast",
        "governanceDomain": [
          "frontend",
          "api"
        ],
        "impactHint": "medium",
        "severity": "warning",
        "message": "Unexpected console statement",
        "file": "/workspace/myapp/src/index.ts",
        "language": "typescript",
        "range": {
          "start": {
            "line": 10,
            "column": 0,
            "index": 245
          },
          "end": {
            "line": 10,
            "column": 11,
            "index": 256
          }
        },
        "excerpt": "console.log",
        "hasFix": false,
        "proposedReplacement": null,
        "diff": null,
        "applied": false,
        "fingerprint": "a1b2c3d4e5f60718293a4b5c6d7e8f90"
      }
    ],
    "parseCache": {
      "hits": 15,
      "misses": 27,
      "entries": 27,
      "maxEntries": 128
    },
    "parseFailures": {
      "count": 1,
      "sampleLimit": 20,
      "truncated": false,
      "byLanguage": {
        "JavaScript": 1
      },
      "samples": [
        {
          "file": "/workspace/myapp/src/broken.js",
          "language": "JavaScript",
          "error": "Unexpected token"
        }
      ]
    },
    "scanTelemetry": {
      "durationMs": 37,
      "mode": "ast",
      "explicitRulePatterns": 1,
      "loadedRules": 12,
      "estimatedFiles": 42,
      "nativeInputs": {
        "openApiDocuments": 0,
        "openApiComparisons": 0,
        "schemaDocuments": 0,
        "schemaComparisons": 0,
        "contractArtifacts": 0,
        "schemaArtifacts": 0
      }
    }
  }
}
```
<!-- @generated scan-api-contract-examples:end -->
