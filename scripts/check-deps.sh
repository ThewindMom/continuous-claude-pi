#!/usr/bin/env bash
set -euo pipefail

missing=0
for cmd in tldr bloks ouros fastedit; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "MISSING: $cmd"
    missing=1
  else
    echo "OK: $cmd -> $(command -v "$cmd")"
  fi
done

if [[ -z "${EXA_API_KEY:-}" ]]; then
  echo "WARN: EXA_API_KEY not set"
fi
if [[ -z "${NIA_API_KEY:-}" ]]; then
  echo "WARN: NIA_API_KEY not set"
fi

exit $missing
