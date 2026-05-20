#!/usr/bin/env bash
set -euo pipefail

printf '\n[fallow:audit] changed-file quality gate\n'
args=("$@")
if [ "${#args[@]}" -eq 0 ]; then
  args=(--changed-since HEAD)
fi

RUST_LOG="${RUST_LOG:-error}" bun x fallow audit --config fallow.config.json "${args[@]}"
