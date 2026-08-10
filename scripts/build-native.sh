#!/usr/bin/env bash
# Build the ClaudeKeeper macOS power helper (Swift + IOKit).
# Produces a universal binary at native/build/claudekeeper-power.
# Safe to run on non-macOS / no-swiftc systems: it prints a friendly note and exits 0.

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$here/native/ClaudeKeeperPower/main.swift"
out_dir="$here/native/build"
out="$out_dir/claudekeeper-power"

if ! command -v swiftc >/dev/null 2>&1; then
  echo "build-native: swiftc not found; skipping native power helper build."
  echo "build-native: (this is fine on non-macOS CI — the TS side will fall back to caffeinate)"
  exit 0
fi

if [[ ! -f "$src" ]]; then
  echo "build-native: source not found at $src" >&2
  exit 1
fi

mkdir -p "$out_dir"

# Idempotent: skip if binary is newer than the source.
if [[ -x "$out" && "$out" -nt "$src" ]]; then
  echo "build-native: $out is up to date, skipping."
  exit 0
fi

tmp_arm="$out_dir/.claudekeeper-power.arm64"
tmp_x86="$out_dir/.claudekeeper-power.x86_64"

echo "build-native: compiling arm64 slice…"
swiftc -O -target arm64-apple-macos11 -o "$tmp_arm" "$src"

if swiftc -O -target x86_64-apple-macos11 -o "$tmp_x86" "$src" 2>/dev/null; then
  echo "build-native: compiling x86_64 slice…"
  if command -v lipo >/dev/null 2>&1; then
    lipo -create -output "$out" "$tmp_arm" "$tmp_x86"
    rm -f "$tmp_arm" "$tmp_x86"
  else
    mv "$tmp_arm" "$out"
    rm -f "$tmp_x86"
  fi
else
  echo "build-native: x86_64 SDK unavailable, shipping arm64-only binary."
  mv "$tmp_arm" "$out"
fi

chmod +x "$out"
echo "build-native: built $out"
