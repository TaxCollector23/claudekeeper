# ClaudeKeeper

Local supervisor for Claude Code. Keep Claude working.

<!-- TODO: dashboard screenshot -->

macOS. Node 18+. MIT.

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

From npm (published under a user scope; the command is still `claudekeeper`):

```bash
npm install -g @rangan23/claudekeeper
claudekeeper daemon start
```

Or run without installing:

```bash
npx @rangan23/claudekeeper daemon start
```

Dev install from source:

```bash
git clone https://github.com/TaxCollector23/claudekeeper
cd claudekeeper
npm install
npm run build
./scripts/install.sh   # registers the launchd agent + symlinks the CLI
```

Requires macOS and Node.js 18 or newer.

## Quick start

```bash
claudekeeper daemon start     # keep your Mac awake — no admin needed
```

That's it. Start the daemon, then run Claude Code however you normally do — in a
terminal, an IDE, wherever. The daemon keeps your Mac from sleeping so Claude
keeps working while you're away from the keyboard. It prints the port it's
serving on and needs **no admin**.

To also keep running with the lid *physically closed* on the built-in display,
add `--lid` (needs admin once — macOS requires it). With an external display +
power you don't even need that: close the lid and it keeps running (clamshell).
When you're done:

```bash
claudekeeper daemon stop      # stop the daemon and restore normal sleep
claudekeeper uninstall        # stop, restore sleep, remove the launchd agent + CLI symlink
```

## Commands

| Command                          | What it does                                                          |
| -------------------------------- | -------------------------------------------------------------------- |
| `claudekeeper daemon start`      | Keep your Mac awake so Claude keeps running. No admin needed.         |
| `claudekeeper daemon start --lid` | Also stay awake with the lid closed (needs admin once).             |
| `claudekeeper daemon stop`       | Stop the daemon and restore normal sleep.                            |
| `claudekeeper uninstall`         | Stop, restore sleep, and remove ClaudeKeeper.                        |

A local dashboard is served at the printed URL (default `http://localhost:7642`)
if you want to watch state; it's optional.

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

## Keeping the lid closed

There are two distinct macOS behaviors, and ClaudeKeeper is honest about both.

**Idle sleep** — the Mac sleeping after inactivity. Held off by a sleep
assertion the daemon takes for its whole lifetime (via a tiny native IOKit
helper calling `IOPMAssertionCreateWithName`, or `caffeinate -dimsu` as a
fallback). Visible in `pmset -g assertions` as `ClaudeKeeper: active-session`.
No privileges required.

**Lid-close sleep** — closing a MacBook's lid forces sleep, and **no ordinary
sleep assertion overrides that**. `caffeinate` does not help here; neither does
any IOKit idle assertion. The one reliable mechanism is:

```bash
sudo pmset -a disablesleep 1
```

`claudekeeper daemon start` runs exactly this for you (hence the one `sudo`
prompt). With it set, the Mac stays fully awake with the lid shut — screen off,
CPU and your Claude process still running. `daemon stop` and `uninstall` restore
it (`disablesleep 0`); it also resets on reboot, so the safe default returns on
its own. Use `--no-lid` to skip this entirely (idle-sleep prevention only).

> ⚠ **Thermals and battery.** A closed Mac that never sleeps generates heat with
> the lid shut. Run on AC power, and don't leave it running full-tilt in a
> closed bag. This is the real tradeoff for keeping Claude working lid-closed —
> we'd rather tell you than pretend it's free.

## Troubleshooting

- **Port already in use.** `lsof -iTCP:7642 -sTCP:LISTEN`. ClaudeKeeper is
  probably already running; otherwise set `port` in
  `~/.config/claudekeeper/config.json` and start again.
- **The sudo prompt.** `daemon start` asks for `sudo` once, only to run
  `pmset -a disablesleep 1` (keep running lid-closed). Decline it and the daemon
  still prevents idle sleep; use `--no-lid` to skip the prompt entirely.
- **Mac won't sleep after I'm done.** Run `claudekeeper daemon stop` (or
  `uninstall`) to restore `disablesleep 0`. It also resets on reboot.
- **Daemon won't start.** Check `~/Library/Logs/ClaudeKeeper/daemon.err.log`.
  Common causes: stale PID file at `~/Library/Application Support/ClaudeKeeper/daemon.pid`,
  another daemon on the port, missing `dist/` (run `npm run build`).

## Development

```bash
npm install
npm run typecheck        # tsc --noEmit
npm run test             # vitest run (114 tests)
npm run build            # daemon + dashboard
npm run daemon           # run the daemon in foreground via tsx
npm run dashboard:dev    # vite dev server for the dashboard
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the internals and
[CONTRIBUTING.md](./CONTRIBUTING.md) for the PR flow.

## License

MIT. See [LICENSE](./LICENSE).
