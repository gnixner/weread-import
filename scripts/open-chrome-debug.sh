#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-9222}"
PROFILE_DIR="${HOME}/.weread-import-profile"
CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [ ! -x "$CHROME_BIN" ]; then
  echo "Google Chrome not found at: $CHROME_BIN" >&2
  exit 1
fi

mkdir -p "$PROFILE_DIR"
exec "$CHROME_BIN" \
  --remote-debugging-port="$PORT" \
  --user-data-dir="$PROFILE_DIR"
