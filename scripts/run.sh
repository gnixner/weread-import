#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
if [ ! -d "$ROOT_DIR/node_modules" ]; then
  echo "首次运行，正在安装依赖..." >&2
  (cd "$ROOT_DIR" && npm install --production)
fi

# 自动确保 Chrome CDP 可用，并在快照过期时触发同步/重启
CDP_PORT="${WEREAD_CDP_PORT:-9222}"
echo "正在校验 Chrome CDP..." >&2
# 在独立子 shell 中启动/刷新 Chrome，完全脱离当前进程树
(bash "$SCRIPT_DIR/open-chrome-debug.sh" "$CDP_PORT" > /dev/null 2>&1 &)
for i in $(seq 1 10); do
  sleep 1
  if curl -s "http://127.0.0.1:$CDP_PORT/json/version" > /dev/null 2>&1; then
    echo "Chrome CDP 已就绪。" >&2
    break
  fi
  if [ "$i" -eq 10 ]; then
    echo "Chrome CDP 启动超时，将仅使用 API 模式。" >&2
  fi
done

node "$ROOT_DIR/src/cli.mjs" "$@"
