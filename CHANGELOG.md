# Changelog

All notable changes to this project will be documented in this file. The
format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.2.0]

### Changed

- **Focused the CLI on keeping the Mac awake.** The command surface is now just
  `claudekeeper daemon start`, `claudekeeper daemon stop`, and
  `claudekeeper uninstall`. The session-management commands (`run`, `status`,
  `sessions`, `logs`, `stop`, `resume`, `config`, `dashboard`, `doctor`) were
  removed from the CLI; the daemon and its HTTP/SSE API + dashboard are unchanged.
- `daemon start` now prints the URL/port it is serving on.

### Added

- **Real lid-close survival.** `daemon start` runs `sudo pmset -a disablesleep 1`
  so the Mac keeps running (CPU + your Claude process) with the lid closed — the
  only mechanism that actually overrides lid-close sleep; idle-sleep assertions
  do not. `daemon stop` / `uninstall` restore `disablesleep 0`. `--no-lid` skips
  the sudo step (idle-sleep prevention only).
- Baseline idle-sleep assertion held for the daemon's whole lifetime, so idle
  sleep is prevented even with no managed session.
- `claudekeeper uninstall` command (restore sleep, stop daemon, remove launchd
  agent + CLI symlink).

## [0.1.0-history]

### Added

- Detached Claude spawning so sessions survive daemon restarts and terminal
  closure (own process group, log file redirection instead of inherited pipes).
- Per-session log files at `~/Library/Logs/ClaudeKeeper/sessions/<id>.log`,
  tailed with `fs.watch` and streamed as `session.output` SSE events.
- PID polling for exit detection via `kill(pid, 0)`, with startup
  reconciliation: living PIDs are re-attached, dead ones become `interrupted`.
- `ClaudeAdapter.resume()` via `claude --resume <claudeSessionId>`.
- CLI commands: `claudekeeper resume`, `claudekeeper config get|set`,
  `claudekeeper doctor`.
- Server endpoint `POST /api/sessions/:id/resume` and a tolerant content-type
  parser so parameterless POSTs (`stop`, `resume`) work with `Content-Length: 0`.
- 102-test Vitest suite covering the session state machine, repositories,
  power reference counting, config load/save, and integration API.
- Dashboard: warning banner, live events timeline, connection indicator,
  log viewer with pause and copy, split into components, live-ticking uptime.
- macOS notifications on session completion and failure.
- Log rotation with configurable retention days (`logRetentionDays`).

## [0.1.0]

Initial preview: daemon, SQLite persistence, basic CLI, launchd installer,
dashboard skeleton, `caffeinate`-backed sleep assertion.
