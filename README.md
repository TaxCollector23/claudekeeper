# ClaudeKeeper

Local supervisor for Claude Code. Keep Claude working — even when your terminal, dashboard, or browser closes. macOS only.

## Architecture

```
        CLI ─┐              ┌─ Dashboard (localhost:7642)
             ├─► Local API ─┤
             │              │
             ▼              ▼
        ┌─────────────────────────┐
        │   ClaudeKeeper Daemon   │  ◄── owns everything
        │  claude · power · lid   │      (session state, PIDs,
        │  sqlite · events · SSE  │       sleep assertions, logs)
        └─────────────────────────┘
                    │
                 launchd
```

The daemon is the source of truth. The CLI and dashboard are clients. Closing either does not stop Claude.

## Install (dev)

Requires macOS, Node.js ≥ 20.

```bash
npm install
npm run build           # compiles daemon + dashboard
./scripts/install.sh    # registers launchd agent + symlinks /usr/local/bin/claudekeeper
claudekeeper doctor
```

Uninstall:

```bash
./scripts/uninstall.sh
```

## Quick start

```bash
claudekeeper daemon start          # once, unless installed via launchd
claudekeeper run                   # starts Claude Code in the current dir under the daemon
claudekeeper status                # daemon + sessions + power/lid/sleep
claudekeeper sessions              # full list
claudekeeper logs <session-id> -f  # follow logs live
claudekeeper stop <session-id>
claudekeeper dashboard             # opens http://localhost:7642
```

`claudekeeper run` streams live output. Ctrl+C **detaches** — the session keeps running in the daemon.

## What's implemented

- Daemon with Fastify HTTP + SSE, binds `127.0.0.1:7642`
- SQLite persistence (`~/Library/Application Support/ClaudeKeeper/claudekeeper.db`)
- Session manager with explicit state machine (`starting → working → completed|failed|crashed|stopped`)
- Reference-counted sleep assertion via `caffeinate -dimsu` — held while any managed session is active, released when the last one ends
- Power source and battery detection (`pmset`), lid detection (`ioreg AppleClamshellState`), 5 s poll
- Startup reconciliation: sessions left running from a previous daemon run are checked via `kill(pid, 0)` and marked `interrupted` if the process is gone
- CLI: `run`, `status`, `sessions`, `logs`, `stop`, `doctor`, `dashboard`, `daemon {start,stop,restart}`
- Dashboard: overview (system + active + recent), sessions list with filter, session detail with live SSE-driven log stream
- launchd plist template + install/uninstall scripts

## Honest caveats

- **Sleep and the closed lid.** macOS restricts continued operation with the lid closed on some hardware. This build uses `caffeinate -dimsu`, which prevents *idle* sleep and disk sleep. It does **not** guarantee operation with the lid closed on unsupported machines. The dashboard reports lid state and sleep assertion state separately so you can see the actual situation rather than a fiction.
- **v1 packaging.** The spec calls for a full pnpm monorepo (`apps/*`, `packages/*`). This build consolidates into a single Node package with clean module boundaries at `src/{shared,database,macos,core,daemon,cli,dashboard}`. Splitting into workspaces later is mechanical.
- **No native macOS helper yet.** IOKit `IOPMAssertionCreateWithName` via a small Swift/ObjC helper is planned; `caffeinate` is the pragmatic fallback and is what Apple ships for this purpose.
- **No automatic Claude session resume yet.** Interrupted sessions are marked `interrupted`; the `resume` CLI command is a follow-up.
- **Notifications, log rotation, config CLI, tests** — scaffolding is in place (`src/macos/system.ts` `notify`, `LogRepository.purgeOlderThan`, `loadConfig`) but not fully wired to every event.

## Configuration

`~/.config/claudekeeper/config.json`:

```json
{
  "port": 7642,
  "host": "127.0.0.1",
  "preventSleep": true,
  "notifications": true,
  "logRetentionDays": 7,
  "autoResume": false
}
```

## Layout

```
src/
  shared/     types, constants, config
  database/   SQLite client + repositories
  macos/      power, lid, notifications
  core/       event bus, claude adapter, session manager, state machine
  daemon/     fastify server + lifecycle
  cli/        commander CLI
  dashboard/  React + Vite
launchd/      com.claudekeeper.daemon.plist template
scripts/      install.sh, uninstall.sh
bin/          claudekeeper.mjs entry point
```

## The one architectural rule

The CLI and the dashboard are clients. The daemon owns Claude. Never bypass it.
