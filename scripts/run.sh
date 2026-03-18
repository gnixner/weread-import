#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
if [ ! -d "$ROOT_DIR/node_modules" ]; then
  echo "首次运行，正在安装依赖..." >&2
  (cd "$ROOT_DIR" && npm install --production)
fi
exec node "$ROOT_DIR/src/cli.mjs" "$@"
