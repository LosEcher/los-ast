# Cantool Sample

A small Rust project for validating los-ast scan functionality on Rust code.

## Expected Findings

When scanned with appropriate rules:
- `src/main.rs:10` - unwrap() usage in load_config
- `src/main.rs:20` - unused function unused_helper

## Usage

```bash
cd fixtures/golden/cantool-sample
los-ast scan --include "src/**/*.rs"
```
