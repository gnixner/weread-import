#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-9222}"
PROFILE_DIR="${HOME}/.weread-import-profile"
CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
CHROME_DEFAULT="$HOME/Library/Application Support/Google/Chrome"

if [ ! -x "$CHROME_BIN" ]; then
  echo "未找到 Google Chrome: $CHROME_BIN" >&2
  exit 1
fi

# 首次使用或登录态过期时，从默认 Profile 同步 Cookie
if [ ! -d "$PROFILE_DIR/Default" ] || [ "${SYNC_PROFILE:-}" = "1" ]; then
  echo "正在从默认 Chrome Profile 同步登录态..." >&2
  mkdir -p "$PROFILE_DIR"
  # 仅复制保留登录态所需的文件
  for item in "Default/Cookies" "Default/Cookies-journal" "Default/Login Data" "Default/Login Data-journal" "Default/Preferences" "Default/Secure Preferences" "Local State"; do
    src="$CHROME_DEFAULT/$item"
    dest="$PROFILE_DIR/$item"
    if [ -e "$src" ]; then
      mkdir -p "$(dirname "$dest")"
      cp -f "$src" "$dest"
    fi
  done
  echo "同步完成。" >&2
fi

# 检查是否已有实例在监听
if curl -s "http://127.0.0.1:$PORT/json/version" > /dev/null 2>&1; then
  echo "Chrome CDP 已在端口 $PORT 运行。" >&2
  exit 0
fi

exec "$CHROME_BIN" \
  --remote-debugging-port="$PORT" \
  --user-data-dir="$PROFILE_DIR"
