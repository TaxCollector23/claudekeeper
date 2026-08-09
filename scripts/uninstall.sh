#!/usr/bin/env bash
set -euo pipefail
PLIST="$HOME/Library/LaunchAgents/com.claudekeeper.daemon.plist"
if [[ -f "$PLIST" ]]; then
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Unloaded and removed $PLIST"
fi
if [[ -L /usr/local/bin/claudekeeper ]]; then
  rm -f /usr/local/bin/claudekeeper
  echo "Removed /usr/local/bin/claudekeeper"
fi
echo "Done. Your data at ~/Library/Application Support/ClaudeKeeper is preserved."
