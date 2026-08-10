# Architecture

## The one rule

**The daemon owns Claude.** Sessions, PIDs, sleep assertions, log files, and
event history all live in the daemon process. The CLI and the dashboard are
thin clients over a local HTTP + SSE API. They can crash, be closed, be
reinstalled — none of it disturbs a running Claude session.

Rationale:

- **One source of truth.** No dueling PID lists, no orphaned processes, no
  "did I already start Claude?" ambiguity.
- **Terminal independence.** Sessions outlive the terminal that spawned them.
- **Honest reporting.** Power state, lid state, and sleep assertion state come
  from one place. Different UIs can't disagree.
- **Recoverability.** A single well-defined state store means daemon restarts
  are boring: read the DB, probe PIDs, re-attach.

## Component map

```
                  ┌─────────────────────────────┐
                  │           Daemon            │
                  │  (src/daemon, Fastify HTTP) │
                  └───────────────┬─────────────┘
                                  │
       ┌──────────────┬───────────┼───────────┬──────────────┐
       ▼              ▼           ▼           ▼              ▼
  SessionManager  ClaudeAdapter  EventBus  Repositories  PowerManager
  (state machine, (spawn/kill,   (typed    (SQLite:      (SleepAssertion
   PID polling,    resume via     pub/sub, sessions,     refcounted +
   log tailing)    --resume)      SSE feed) logs, events)LidMonitor)
```

- **Session Manager** (`src/core/session-manager.ts`) — owns the session
  lifecycle: spawn, transition state, tail log file via `fs.watch`, poll PID
  with `kill(pid, 0)` for exit detection, persist to SQLite, emit events.
- **Claude Adapter** (`src/core/claude-adapter.ts`) — locates the `claude`
  binary, spawns it detached with per-session log redirection, calls
  `--resume <claudeSessionId>` for resumes.
- **Power Manager** (`src/macos/power.ts`, `src/macos/lid.ts`) — polls `pmset`
  and `ioreg`; holds a reference-counted `SleepAssertion` backed by
  `caffeinate -dimsu` (or the native IOKit helper if built).
- **Event Bus** (`src/core/events.ts`) — in-process typed pub/sub; each SSE
  subscriber gets a fan-out from this bus.
- **Repositories** (`src/database/`) — SQLite via `better-sqlite3`; tables for
  sessions, session events, and log lines; `LogRepository.purgeOlderThan` for
  rotation.
- **Notifier** (`src/macos/system.ts`) — `osascript` notifications on session
  completion / failure.

## Session lifecycle

States are defined in `src/shared/types.ts`:

```
                      ┌─────────────┐
                      │  starting   │
                      └──────┬──────┘
                             │  spawn OK, first output
                             ▼
                      ┌─────────────┐
              ┌───────│   working   │───────┐
              │       └──────┬──────┘       │
    stopSession()            │              │  process exits
              │       exit 0 │  exit !=0    │  without our signal
              ▼              ▼              ▼
      ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
      │   stopped   │ │  completed  │ │   failed    │
      └─────────────┘ └─────────────┘ └─────────────┘

                       spawn/adapter throws
                             │
                             ▼
                      ┌─────────────┐
                      │   crashed   │
                      └─────────────┘

                daemon restart, PID gone
                             │
                             ▼
                      ┌─────────────┐   claudekeeper resume
                      │ interrupted │─────────────────────────► starting
                      └─────────────┘
```

`waiting` is reserved for future interactive-prompt detection.

Every transition is persisted and re-emitted on the bus as
`session.status_changed`.

## Sleep-assertion reference counting

From `src/macos/power.ts` (`SleepAssertion`):

- Sessions call `acquire()` when they enter `working` and `release()` when
  they leave it.
- `acquire()` increments a counter. On `0 → 1` it spawns
  `caffeinate -dimsu` and holds the child. Subsequent acquires only bump the
  counter.
- `release()` decrements. On `1 → 0` it `SIGTERM`s the child.
- `releaseAll()` is called on daemon shutdown to guarantee the assertion is
  dropped even if bookkeeping drifted.

The daemon exposes `sleepAssertionActive` in `/api/status` and emits
`sleep_assertion.changed` so the dashboard shows what actually holds. If the
counter is 0 there is no assertion; the UI does not pretend otherwise.

## Data layout

| Path                                                                    | Contents                              |
| ----------------------------------------------------------------------- | ------------------------------------- |
| `~/Library/Application Support/ClaudeKeeper/claudekeeper.db`            | SQLite: sessions, events, log lines.  |
| `~/Library/Application Support/ClaudeKeeper/daemon.pid`                 | Daemon PID file.                      |
| `~/Library/Logs/ClaudeKeeper/daemon.out.log`                            | Daemon stdout (from launchd).         |
| `~/Library/Logs/ClaudeKeeper/daemon.err.log`                            | Daemon stderr (from launchd).         |
| `~/Library/Logs/ClaudeKeeper/sessions/<session-id>.log`                 | Per-session merged stdout+stderr.     |
| `~/.config/claudekeeper/config.json`                                    | User config (see README).             |
| `~/Library/LaunchAgents/com.claudekeeper.daemon.plist`                  | launchd agent (installed by script).  |

## HTTP API

Every route lives in `src/daemon/server.ts`:

| Method | Path                              | Purpose                                                 |
| ------ | --------------------------------- | ------------------------------------------------------- |
| GET    | `/api/health`                     | Liveness. Returns `{ ok, startedAt }`.                  |
| GET    | `/api/status`                     | Aggregate `SystemStatus` for the dashboard header.      |
| GET    | `/api/system`                     | `{ power, lid, sleepAssertionActive }`.                 |
| GET    | `/api/power`                      | `PowerState`.                                           |
| GET    | `/api/lid`                        | `{ state }`.                                            |
| GET    | `/api/sessions`                   | All sessions, newest first.                             |
| GET    | `/api/sessions/:id`               | One session or 404.                                     |
| GET    | `/api/sessions/:id/logs?limit=N`  | Last N log lines (default 500).                         |
| POST   | `/api/sessions`                   | Start a session. Body: `{ projectPath, args? }`.        |
| POST   | `/api/sessions/:id/resume`        | Resume an interrupted session via `claude --resume`.    |
| POST   | `/api/sessions/:id/stop`          | SIGTERM the session's process group.                    |
| GET    | `/api/events`                     | SSE stream of `KeeperEvent`s (see below).               |

Static: any non-`/api/` GET falls through to the built dashboard bundle when
present, with an SPA fallback to `index.html`.

## SSE event types

The `KeeperEvent` union (`src/shared/types.ts`) is the wire contract for
`/api/events`:

- `session.started` — new session created and spawned.
- `session.status_changed` — state-machine transition.
- `session.output` — one stdout or stderr chunk from a session.
- `session.completed` — process exited 0.
- `session.failed` — process exited non-zero.
- `session.crashed` — spawn or adapter threw.
- `session.stopped` — user requested stop.
- `lid.changed` — clamshell open/closed/unknown.
- `power.changed` — AC/battery/unknown or percent change.
- `sleep_assertion.changed` — assertion acquired or released.
- `battery.low` — battery below threshold while sessions are active.

Each SSE frame is `event: <type>\ndata: <json>\n\n`. A `:ping` comment is
sent every 15s to keep proxies from closing the stream.

## Recovery

The daemon is designed to survive restarts without human intervention:

1. **Detached spawn.** `ClaudeAdapter` spawns Claude with `detached: true` and
   `stdio: ['ignore', logFd, logFd]`. The child is a new process-group leader
   and does not depend on the daemon's stdio pipes.
2. **Per-session log files.** Every session writes to
   `~/Library/Logs/ClaudeKeeper/sessions/<id>.log`. Recovery re-attaches by
   opening the file and watching it with `fs.watch`; new bytes become
   `session.output` events.
3. **PID polling.** Session Manager probes each recorded live PID with
   `kill(pid, 0)` on an interval. `ESRCH` means the process is gone; we
   reconcile state (`completed` / `failed` / `crashed` if we knew the exit
   code, `interrupted` if we did not).
4. **Startup reconciliation.** On boot the daemon loads every non-terminal
   session, PID-probes it, resumes log tailing for the living, and marks the
   rest `interrupted`. Optionally (`autoResume: true`) it kicks off
   `claude --resume` for them.

The net effect: `launchctl kickstart -k com.claudekeeper.daemon` is a safe
operation. Live sessions keep running; the daemon reconnects to them.
