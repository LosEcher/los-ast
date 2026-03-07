# Mini JS Sample

A minimal JavaScript project for quick validation of los-ast scan functionality.

## Expected Findings

When scanned with `no-console-log` rule:
- `src/index.js:4` - console.log in greet function
- `src/index.js:12` - console.log (indirect, if detected)
- `src/utils.js:4` - console.log in unusedFunction
- `src/utils.js:8` - console.log in processData

## Usage

```bash
cd fixtures/golden/mini-js
los-ast scan --include "src/**/*.js"
```
