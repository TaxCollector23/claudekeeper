# Contributing

Thanks for the interest. ClaudeKeeper is a small, opinionated tool; keep
patches focused and the design context in mind.

## Design context

Read [ARCHITECTURE.md](./ARCHITECTURE.md) before anything nontrivial.
The load-bearing rule is that the daemon owns Claude — the CLI and dashboard
are clients over the local HTTP + SSE API and never manage Claude directly.
Changes that blur this boundary will get pushback.

## Dev setup

Requires macOS and Node.js 20+.

```bash
git clone https://github.com/claudekeeper/claudekeeper
cd claudekeeper
npm install
npm run typecheck
npm run test
npm run build
```

Run the daemon in the foreground while iterating:

```bash
npm run daemon         # tsx src/daemon/index.ts, uses your local config
```

Run the dashboard with Vite HMR against a live daemon:

```bash
npm run dashboard:dev  # http://localhost:5173, proxies /api to :7642
```

## Tests

```bash
npm run test           # vitest run
npm run test:watch     # vitest watch
```

New behavior should ship with tests. Prefer unit tests around the state
machine, repositories, and adapters; integration tests around API routes.
The existing suite mocks native calls (`pmset`, `ioreg`, `caffeinate`,
`osascript`) — do the same for anything platform-shaped.

## PR flow

1. Open an issue first for anything beyond a small fix so we can agree on
   direction before you write code.
2. Branch from `main`. Keep commits small and messages descriptive.
3. `npm run typecheck && npm run test && npm run build` must pass. CI runs
   the same on macOS and Ubuntu across Node 20 and 22.
4. Update `CHANGELOG.md` under `[Unreleased]`.
5. Open the PR. Explain the why more than the what — the diff shows the what.

## Scope

In scope: making the daemon more robust, better recovery, better observability,
tighter macOS integration, dashboard polish.

Out of scope (for now): Linux/Windows ports, remote daemons, multi-user modes,
anything that requires shipping credentials.
