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
terminal, an IDE, wherever. Your Mac normally sleeps a few minutes after you
step away and kills the session; ClaudeKeeper keeps it awake so long runs keep
going. It prints the port it's serving on and needs **no admin, ever**. When
you're done:

```bash
claudekeeper daemon stop      # let your Mac sleep normally again
claudekeeper uninstall        # remove the launchd agent + CLI symlink
```

## Commands

| Command                     | What it does                                              |
| --------------------------- | -------------------------------------------------------- |
| `claudekeeper daemon start` | Keep your Mac awake so Claude keeps running. No admin.    |
| `claudekeeper daemon stop`  | Let your Mac sleep normally again.                       |
| `claudekeeper uninstall`    | Remove ClaudeKeeper.                                     |

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

## How it keeps your Mac awake

The daemon holds a system **sleep assertion** for its whole lifetime — via a
tiny native IOKit helper (`IOPMAssertionCreateWithName`) or `caffeinate -dimsu`
as a fallback. That stops your Mac from sleeping while you're away from the
keyboard, so Claude Code keeps running. It's visible in `pmset -g assertions`
and needs **no admin, no password, nothing** — it just works.

**The closed lid.** ClaudeKeeper also tries to keep working with the lid
*physically closed*, with **no admin** — using the same private trick as
[Fermata](https://github.com/iccir/Fermata) / StillOn: it tags its power
assertion with the undocumented `AppliesOnLidClose` property so it survives the
lid closing. Apple honors this on some macOS versions and blocks it on others
(they've been tightening it on recent Apple Silicon builds). So ClaudeKeeper
**checks whether your Mac accepted it and tells you the truth** — the dashboard
shows *Close the lid: Keeps running* or *Will sleep*, and `daemon start` prints
the same. If your macOS blocks it, the only remaining options are admin
(`sudo pmset -a disablesleep 1`) or an external display (clamshell); otherwise
leave the lid open.

> ⚠ It's an unsupported private API and could break, and a closed Mac running
> full-tilt gets hot — don't run it buried in a bag.

## Troubleshooting

- **Port already in use.** `lsof -iTCP:7642 -sTCP:LISTEN`. ClaudeKeeper is
  probably already running; otherwise set `port` in
  `~/.config/claudekeeper/config.json` and start again.
- **Is it actually working?** Open the dashboard — it shows **Keeping awake:
  Yes**. Leave your Mac idle (lid open) and it won't sleep.
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
