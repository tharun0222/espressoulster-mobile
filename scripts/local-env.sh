#!/usr/bin/env bash
set -euo pipefail
mobile_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$mobile_root"
if ! command -v node >/dev/null 2>&1; then
  export PATH="/home/headrun/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
fi
export PATH="$mobile_root/.tools/bin:/home/headrun/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin:$PATH"
command -v node >/dev/null || { echo "Install Node.js 22.13 or newer."; exit 1; }
