#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname)" != "Darwin" ]]; then
  echo "ClaudeKeeper currently supports macOS only." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "node not found on PATH. Install Node.js 20+ and rerun." >&2
  exit 1
fi

ENTRY="$ROOT/dist/daemon/index.js"
if [[ ! -f "$ENTRY" ]]; then
  echo "==> Building"
  ( cd "$ROOT" && npm install && npm run build )
fi

LAUNCHD_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="$HOME/Library/Logs/ClaudeKeeper"
mkdir -p "$LAUNCHD_DIR" "$LOG_DIR"

PLIST="$LAUNCHD_DIR/com.claudekeeper.daemon.plist"
sed \
  -e "s|__NODE__|$NODE_BIN|g" \
  -e "s|__ENTRY__|$ENTRY|g" \
  -e "s|__LOG_DIR__|$LOG_DIR|g" \
  -e "s|__WORKING_DIR__|$ROOT|g" \
  "$ROOT/launchd/com.claudekeeper.daemon.plist" > "$PLIST"

echo "==> Registered launchd agent at $PLIST"
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "==> Loaded"

# Symlink CLI
if [[ -w /usr/local/bin ]]; then
  ln -sf "$ROOT/bin/claudekeeper.mjs" /usr/local/bin/claudekeeper
  echo "==> Installed /usr/local/bin/claudekeeper"
else
  echo "Note: could not write /usr/local/bin. Add $ROOT/bin to your PATH manually."
fi

sleep 1
echo ""
echo "ClaudeKeeper installed."
echo "  Daemon     ✓ launchd loaded"
echo "  Dashboard  http://localhost:7642"
echo ""
echo "Try:  claudekeeper doctor"
