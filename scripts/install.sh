#!/usr/bin/env bash
set -euo pipefail

# ClaudeKeeper installer — idempotent, safe to re-run.

# ---- pretty output ---------------------------------------------------------
if [[ -t 1 ]] && [[ "${NO_COLOR:-}" == "" ]]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
  C_BLUE=$'\033[34m'; C_DIM=$'\033[2m'
else
  C_RESET=''; C_BOLD=''; C_RED=''; C_GREEN=''; C_YELLOW=''; C_BLUE=''; C_DIM=''
fi

info()  { printf "%s==>%s %s\n" "$C_BLUE"   "$C_RESET" "$*"; }
ok()    { printf "%s  ok%s  %s\n" "$C_GREEN" "$C_RESET" "$*"; }
warn()  { printf "%swarn%s %s\n" "$C_YELLOW" "$C_RESET" "$*" >&2; }
err()   { printf "%serr%s  %s\n" "$C_RED"   "$C_RESET" "$*" >&2; }
die()   { err "$*"; exit 1; }

# ---- flags -----------------------------------------------------------------
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    -y|--yes) ASSUME_YES=1 ;;
    -h|--help)
      cat <<EOF
Usage: install.sh [--yes]

  --yes, -y   Skip confirmation prompts (for scripted installs).
  --help, -h  Show this message.
EOF
      exit 0
      ;;
    *) die "unknown argument: $arg" ;;
  esac
done

confirm() {
  local prompt="$1"
  if [[ "$ASSUME_YES" -eq 1 ]]; then return 0; fi
  local reply
  printf "%s? [y/N] " "$prompt"
  read -r reply || reply=""
  [[ "$reply" =~ ^[Yy]$ ]]
}

# ---- environment checks ----------------------------------------------------
if [[ "$(uname)" != "Darwin" ]]; then
  die "ClaudeKeeper supports macOS only (uname=$(uname))."
fi

NODE_BIN="$(command -v node || true)"
[[ -n "$NODE_BIN" ]] || die "node not found on PATH. Install Node.js 20+ and rerun."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  die "Node.js $NODE_MAJOR detected — 20 or newer required."
fi

ok "macOS + Node $(node -v)"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENTRY="$ROOT/dist/daemon/index.js"

# ---- build if needed -------------------------------------------------------
if [[ ! -f "$ENTRY" ]]; then
  info "Building (npm install && npm run build)"
  ( cd "$ROOT" && npm install && npm run build )
  ok "Built"
else
  ok "dist/ present — skipping build"
fi

# ---- build native sleep helper (best effort) -------------------------------
if [[ -x "$ROOT/scripts/build-native.sh" ]]; then
  info "Building native sleep helper (best effort)"
  bash "$ROOT/scripts/build-native.sh" || warn "native helper build skipped"
fi

# ---- launchd paths ---------------------------------------------------------
LAUNCHD_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="$HOME/Library/Logs/ClaudeKeeper"
DATA_DIR="$HOME/Library/Application Support/ClaudeKeeper"
PLIST="$LAUNCHD_DIR/com.claudekeeper.daemon.plist"
LABEL="com.claudekeeper.daemon"

mkdir -p "$LAUNCHD_DIR" "$LOG_DIR" "$DATA_DIR"

# ---- stop an already-running daemon ---------------------------------------
if launchctl list | grep -q "$LABEL"; then
  warn "daemon $LABEL is already loaded"
  if confirm "unload it before continuing"; then
    launchctl unload "$PLIST" 2>/dev/null || true
    ok "Unloaded"
  else
    die "aborted by user"
  fi
fi

# ---- backup existing plist -------------------------------------------------
if [[ -f "$PLIST" ]]; then
  BAK="$PLIST.bak-$(date +%Y%m%d%H%M%S)"
  cp "$PLIST" "$BAK"
  ok "Backed up existing plist → $(basename "$BAK")"
fi

# ---- write plist -----------------------------------------------------------
sed \
  -e "s|__NODE__|$NODE_BIN|g" \
  -e "s|__ENTRY__|$ENTRY|g" \
  -e "s|__LOG_DIR__|$LOG_DIR|g" \
  -e "s|__WORKING_DIR__|$ROOT|g" \
  "$ROOT/launchd/com.claudekeeper.daemon.plist" > "$PLIST"

ok "Wrote $PLIST"

launchctl load "$PLIST"
ok "Loaded $LABEL"

# ---- symlink CLI -----------------------------------------------------------
CLI_SRC="$ROOT/bin/claudekeeper.mjs"
CLI_DST="/usr/local/bin/claudekeeper"
if [[ -w "$(dirname "$CLI_DST")" ]]; then
  ln -sf "$CLI_SRC" "$CLI_DST"
  ok "Linked $CLI_DST"
else
  warn "cannot write $(dirname "$CLI_DST"); add $ROOT/bin to PATH yourself"
fi

# ---- sleep helper detection ------------------------------------------------
if [[ -x "$ROOT/native/build/claudekeeper-power" ]]; then
  ok "Using native sleep helper (IOKit)"
else
  ok "Using caffeinate fallback"
fi

# ---- done ------------------------------------------------------------------
printf "\n%s%sClaudeKeeper installed.%s\n\n" "$C_BOLD" "$C_GREEN" "$C_RESET"
printf "%sNext:%s\n" "$C_BOLD" "$C_RESET"
printf "  %sclaudekeeper doctor%s      %s# sanity check%s\n"       "$C_BLUE" "$C_RESET" "$C_DIM" "$C_RESET"
printf "  %sclaudekeeper run%s         %s# start a Claude session%s\n" "$C_BLUE" "$C_RESET" "$C_DIM" "$C_RESET"
printf "  %sclaudekeeper dashboard%s   %s# open http://localhost:7642%s\n\n" "$C_BLUE" "$C_RESET" "$C_DIM" "$C_RESET"
