# ClaudeKeeper

Local supervisor for Claude Code. Keep Claude working.

<!-- TODO: dashboard screenshot -->

macOS. Node 24+. MIT.

---

## Why

Claude Code is a foreground process tied to your terminal. Close the tab, the
session dies. Let the machine sleep, the session stalls. Nothing outside that
window knows whether Claude is still working, has finished, or has crashed.

ClaudeKeeper is a small local daemon that owns Claude Code sessions on your
behalf. It spawns Claude detached from your terminal, holds a sleep assertion
while work is running, streams logs to disk, and exposes an HTTP + SSE API for
a CLI and a browser dashboard. Terminal-independent. Honest about power and
lid state instead of pretending everything is fine.

## Install

From npm:

```bash
npm install -g claudekeeper
claudekeeper doctor
```

Or run without installing:

```bash
npx claudekeeper doctor
```

Dev install from source:

```bash
git clone https://github.com/claudekeeper/claudekeeper
cd claudekeeper
npm install
npm run build
./scripts/install.sh   # registers the launchd agent + symlinks the CLI
```

Requires macOS and Node.js 24 or newer (ClaudeKeeper uses the built-in node:sqlite, stable on Node 24+).

## Quick start

```bash
claudekeeper doctor                  # sanity check
claudekeeper run                     # start Claude in current dir, under the daemon
claudekeeper status                  # daemon + sessions + power/lid
claudekeeper sessions                # full list, all-time
claudekeeper dashboard               # open http://localhost:7642
```

`claudekeeper run` streams live output. `Ctrl+C` **detaches** — the session
keeps running inside the daemon. Reattach with `claudekeeper logs <id> -f`.

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

**The one rule:** the daemon owns Claude. The CLI and dashboard are clients.
Never bypass the daemon. See [ARCHITECTURE.md](./ARCHITECTURE.md) for detail.

## Commands

| Command                         | What it does                                                   |
| ------------------------------- | -------------------------------------------------------------- |
| `claudekeeper run [args...]`    | Start a Claude session in the current dir under the daemon.    |
| `claudekeeper status`           | Daemon health, active sessions, power source, lid, assertion.  |
| `claudekeeper sessions`         | List all sessions (any status).                                |
| `claudekeeper logs <id> [-f]`   | Print or follow a session's log stream.                        |
| `claudekeeper stop <id>`        | Signal a session to stop.                                      |
| `claudekeeper resume <id>`      | Resume an interrupted session via Claude `--resume`.           |
| `claudekeeper dashboard`        | Open the web dashboard.                                        |
| `claudekeeper doctor`           | Diagnose Node, Claude, daemon, port, and permissions.          |
| `claudekeeper config [get\|set]`| Read or write `~/.config/claudekeeper/config.json`.            |
| `claudekeeper daemon {start\|stop\|restart}` | Manage the daemon directly (bypasses launchd).    |

## Configuration

`~/.config/claudekeeper/config.json`:

| Key                | Type    | Default       | Meaning                                              |
| ------------------ | ------- | ------------- | ---------------------------------------------------- |
| `port`             | number  | `7642`        | HTTP + SSE port.                                     |
| `host`             | string  | `127.0.0.1`   | Bind address. Keep loopback unless you know why.     |
| `preventSleep`     | boolean | `true`        | Hold a sleep assertion while sessions are running.   |
| `notifications`    | boolean | `true`        | macOS notifications on completion / failure.         |
| `logRetentionDays` | number  | `7`           | Days of session logs to keep. `0` disables purging.  |
| `autoResume`       | boolean | `false`       | Auto-resume `interrupted` sessions at daemon start.  |

## How it survives closures

- **Terminal closes.** Sessions are spawned detached, with their own stdio piped
  to per-session log files. The daemon holds the PID; the terminal is optional.
- **Dashboard closes.** The dashboard is a client of the HTTP + SSE API. It has
  no session state of its own. Close it, reopen it — nothing changes.
- **Daemon restarts.** On startup the daemon reads sessions from SQLite,
  probes each recorded PID with `kill(pid, 0)`, re-attaches to log tails for
  live PIDs, and marks the rest `interrupted`.

## Sleep behavior

ClaudeKeeper reference-counts sleep assertions: acquires one when the first
session starts working, releases it when the last one ends. The dashboard
surfaces the assertion state so you can see the reality rather than a claim.

Two backends:

- **`caffeinate -dimsu`** (default). Ships with macOS. Prevents idle sleep,
  display sleep, disk sleep, and system sleep on AC. Does **not** guarantee
  operation with the lid closed on unsupported hardware.
- **Native IOKit helper** (`native/ClaudeKeeperPower`, when built). A tiny
  Swift binary that calls `IOPMAssertionCreateWithName`. Same intent, one
  fewer subprocess, and easier to attribute in `pmset -g assertions`.

Lid state is polled from `ioreg AppleClamshellState` and reported separately.
If your Mac cannot run with the lid closed, closing it will still sleep. We
show you the truth instead of pretending.

## Troubleshooting

- **Port 7642 already in use.** `lsof -iTCP:7642 -sTCP:LISTEN`. Kill the
  offender, or set `port` in `~/.config/claudekeeper/config.json` and restart
  the daemon.
- **Claude Code not found.** `claudekeeper doctor` prints where it looked.
  Install Claude Code, or add its dir to your login shell `PATH` (launchd
  inherits from `launchctl setenv`, not from `.zshrc`).
- **Daemon won't start.** Check `~/Library/Logs/ClaudeKeeper/daemon.err.log`.
  Common causes: stale PID file at `~/Library/Application Support/ClaudeKeeper/daemon.pid`,
  another daemon on the port, missing `dist/` (run `npm run build`).
- **Sessions disappearing from the list.** They aren't — they moved to
  `completed`, `failed`, `crashed`, `stopped`, or `interrupted`. The default
  view filters to active. Use `claudekeeper sessions` or the dashboard's
  "All" filter.
- **Reinstall from scratch.** `./scripts/uninstall.sh && ./scripts/install.sh`.

## Development

```bash
npm install
npm run typecheck        # tsc --noEmit
npm run test             # vitest run (112 tests)
npm run build            # daemon + dashboard
npm run daemon           # run the daemon in foreground via tsx
npm run dashboard:dev    # vite dev server for the dashboard
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the internals and
[CONTRIBUTING.md](./CONTRIBUTING.md) for the PR flow.

## License

MIT. See [LICENSE](./LICENSE).
