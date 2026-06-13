#!/usr/bin/env bash
set -euo pipefail

# Module size check — enforces file size limits on production source modules.
# Modeled after los's check-structure.sh pattern.
# Scan packages/*/src/**/*.{ts,mjs} excluding dist/, node_modules/, test files, and shared helpers.

MAX_ERROR=600
MAX_WARN=400
HAS_ERROR=0
HAS_WARN=0

# Files granted exceptions (space-separated, relative to repo root)
# Add justification as a comment after each entry.
ALLOWED_LARGE_FILES="
  packages/api/tests/unit/services/scan-service.test.ts
  packages/api/tests/unit/services/artifact-parsers.test.ts
  packages/core/src/extraction/extractors/typescript-extractor.mjs
  packages/cli/src/route-guard-analysis/control-flow.mjs
  packages/api/src/services/openapi-artifacts.ts
  packages/api/src/services/schema-artifacts/shared/comparator.ts
"

cd "$(dirname "$0")/.." || exit 1

# Collect production source files (>400 lines)
echo "==> Scanning for files exceeding size thresholds..."
echo "    Error threshold: ${MAX_ERROR} lines"
echo "    Warn threshold:  ${MAX_WARN} lines"
echo ""

ERROR_FILES=()
WARN_FILES=()

while IFS= read -r -d '' file; do
  rel="${file#./}"
  lines=$(wc -l < "$file" | tr -d ' ')

  # Check if this file is in the allowlist
  allowed=false
  for allowed_file in $ALLOWED_LARGE_FILES; do
    if [ "$rel" = "$allowed_file" ]; then
      allowed=true
      break
    fi
  done
  if $allowed; then
    continue
  fi

  if [ "$lines" -gt "$MAX_ERROR" ]; then
    ERROR_FILES+=("$rel:$lines")
    HAS_ERROR=1
  elif [ "$lines" -gt "$MAX_WARN" ]; then
    WARN_FILES+=("$rel:$lines")
    HAS_WARN=1
  fi
done < <(find packages/*/src -type f \( -name '*.ts' -o -name '*.mjs' \) \
  ! -path '*/dist/*' \
  ! -path '*/node_modules/*' \
  ! -name '*.test.*' \
  ! -name '*.spec.*' \
  ! -name '*_shared*' \
  -print0 2>/dev/null)

if [ "$HAS_WARN" -eq 1 ]; then
  echo "⚠  Files exceeding ${MAX_WARN}-line warning threshold:"
  for entry in "${WARN_FILES[@]}"; do
    file="${entry%:*}"
    lines="${entry##*:}"
    echo "  ${lines} lines  ${file}"
  done
  echo ""
fi

if [ "$HAS_ERROR" -eq 1 ]; then
  echo "✗ Files exceeding ${MAX_ERROR}-line error threshold:"
  for entry in "${ERROR_FILES[@]}"; do
    file="${entry%:*}"
    lines="${entry##*:}"
    echo "  ${lines} lines  ${file}"
  done
  echo ""
  echo "These files must be split into smaller modules."
  echo "Add exceptions to ALLOWED_LARGE_FILES in scripts/check-module-sizes.sh if justified."
  echo "If the file contains only orchestration (not helper logic), it may qualify for an exception."
  exit 1
fi

if [ "$HAS_WARN" -eq 0 ]; then
  echo "✓ All production source files are under ${MAX_WARN} lines."
fi

