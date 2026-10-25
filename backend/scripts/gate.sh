#!/bin/sh
# Project gate for the Bobly Tide backend, invoked by ledger-gates.
#   gate.sh pre-commit  -> typecheck, only when backend/ is staged (fast)
#   gate.sh full        -> typecheck + full test suite (integration / exit)
set -e

mode="${1:-full}"
repo_root="$(cd "$(dirname "$0")/../.." && pwd)"

# On pre-commit, only gate when backend source is part of this commit.
if [ "$mode" = "pre-commit" ]; then
  if ! git -C "$repo_root" diff --cached --name-only | grep -q '^backend/'; then
    exit 0
  fi
fi

cd "$repo_root/backend"
if [ ! -d node_modules ]; then
  echo "gate: backend/node_modules missing — run 'cd backend && npm install' first"
  exit 1
fi

npm run -s typecheck
if [ "$mode" = "full" ]; then
  npm test
fi
