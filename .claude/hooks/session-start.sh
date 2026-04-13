#!/bin/bash
set -euo pipefail

# Only run in remote Claude Code environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Static HTML project – no package manager dependencies.
# Install htmlhint for HTML linting.
if ! command -v htmlhint &>/dev/null; then
  npm install -g htmlhint --prefer-offline --no-audit --no-fund 2>/dev/null || true
fi

echo "Session ready."
