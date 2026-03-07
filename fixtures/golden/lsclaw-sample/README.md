# LSClaw Sample

A medium-sized TypeScript project for validating los-ast scan functionality on TypeScript code.

## Structure

```
src/
├── index.ts    # Main entry point
├── router.ts   # Router implementation
└── config.ts   # Config manager
```

## Expected Findings

When scanned with appropriate rules:
- `src/index.ts:13` - console.log in start method
- `src/index.ts:14` - console.log in start method
- `src/index.ts:19` - console.log in stop method
- `src/index.ts:35` - console.error in main
- `src/router.ts:14` - console.log in initialize
- `src/router.ts:23` - console.log in cleanup
- `src/config.ts:26` - console.log in load
- `src/config.ts:45` - unused method validatePort

## Usage

```bash
cd fixtures/golden/lsclaw-sample
los-ast scan --include "src/**/*.ts"
```
