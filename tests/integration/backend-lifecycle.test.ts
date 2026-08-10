import os from 'node:os';
import { SessionManager } from '../../src/core/session-manager.js';
import { EventBus } from '../../src/core/events.js';
import { DefaultClaudeAdapter } from '../../src/core/claude-adapter.js';
import type { SleepAssertion } from '../../src/macos/power.js';
import type { Session, SessionStatus, LogStream } from '../../src/shared/types.js';
import type {
  SessionRepository,
  EventRepository,
  LogRepository,
} from '../../src/database/repositories.js';

/**
 * End-to-end backend lifecycle against REAL OS processes. Uses /bin/sh as the
 * "claude" executable so we can drive exit codes and output through the real
 * DefaultClaudeAdapter (detached spawn + fd-stdio log files) and the real
 * SessionManager (exit handler, finalize, log tailing). Cross-platform: /bin/sh
 * and SIGKILL exist on macOS and Linux CI.
 */

function makeRepos() {
  const sessions = new Map<string, Session>();
  const logs = new Map<string, { stream: LogStream; content: string }[]>();

  const sessionRepo = {
    create(input: { id: string; projectPath: string; status: SessionStatus }): Session {
      const now = new Date().toISOString();
      const s: Session = {
        id: input.id,
        projectPath: input.projectPath,
        claudeSessionId: null,
        pid: null,
        status: input.status,
        startedAt: now,
        endedAt: null,
        exitCode: null,
        logPath: null,
        createdAt: now,
        updatedAt: now,
      };
      sessions.set(s.id, s);
      return { ...s };
    },
    get(id: string): Session | null {
      const s = sessions.get(id);
      return s ? { ...s } : null;
    },
    update(id: string, patch: Partial<Session>) {
      const s = sessions.get(id);
      if (s) Object.assign(s, patch, { updatedAt: new Date().toISOString() });
    },
    list: () => [...sessions.values()],
    activeSessions: () =>
      [...sessions.values()].filter((s) => ['starting', 'working', 'waiting'].includes(s.status)),
  } as unknown as SessionRepository;

  const eventRepo = { append: () => {} } as unknown as EventRepository;

  const logRepo = {
    append(id: string, stream: LogStream, content: string) {
      const arr = logs.get(id) ?? [];
      arr.push({ stream, content });
      logs.set(id, arr);
    },
    tail(id: string) {
      return (logs.get(id) ?? []).map((l, i) => ({
        id: i,
        sessionId: id,
        stream: l.stream,
        content: l.content,
        createdAt: new Date().toISOString(),
      }));
    },
  } as unknown as LogRepository;

  return { sessionRepo, eventRepo, logRepo };
}

// preventSleep=false so no caffeinate/native assertion is taken during tests.
const noopSleep = {
  acquire() {},
  release() {},
  releaseAll() {},
  get active() {
    return false;
  },
  get reasons() {
    return 0;
  },
} as unknown as SleepAssertion;

function makeManager() {
  const bus = new EventBus();
  const { sessionRepo, eventRepo, logRepo } = makeRepos();
  const adapter = new DefaultClaudeAdapter();
  // Drive the backend with /bin/sh instead of a real claude binary.
  (adapter as any).findExecutable = async () => '/bin/sh';
  const mgr = new SessionManager(sessionRepo, eventRepo, logRepo, bus, adapter, noopSleep, false);
  return { mgr, bus, sessionRepo, logRepo };
}

function waitForTerminal(bus: EventBus, id: string, timeoutMs = 8000): Promise<SessionStatus> {
  return new Promise((resolve, reject) => {
    const terminal = ['completed', 'failed', 'crashed', 'stopped'];
    const timer = setTimeout(() => {
      unsub();
      reject(new Error(`timeout waiting for terminal status on ${id}`));
    }, timeoutMs);
    const unsub = bus.subscribe((e: any) => {
      if (e.type === 'session.status_changed' && e.sessionId === id && terminal.includes(e.status)) {
        clearTimeout(timer);
        unsub();
        resolve(e.status);
      }
    });
  });
}

const sh = (script: string) => ['-c', script];

describe('backend lifecycle (real processes)', () => {
  it('exit 0 → completed with exitCode 0 and captured output', async () => {
    const { mgr, bus, sessionRepo, logRepo } = makeManager();
    const s = await mgr.startSession({
      projectPath: os.tmpdir(),
      args: sh('printf "alpha\\nbeta\\n"; exit 0'),
    });
    await waitForTerminal(bus, s.id);
    const fin = sessionRepo.get(s.id)!;
    expect(fin.status).toBe('completed');
    expect(fin.exitCode).toBe(0);
    const out = logRepo
      .tail(s.id)
      .map((l) => l.content)
      .join('');
    expect(out).toContain('alpha');
    expect(out).toContain('beta');
  });

  it('non-zero exit → failed with the real exit code', async () => {
    const { mgr, bus, sessionRepo } = makeManager();
    const s = await mgr.startSession({ projectPath: os.tmpdir(), args: sh('exit 5') });
    await waitForTerminal(bus, s.id);
    const fin = sessionRepo.get(s.id)!;
    expect(fin.status).toBe('failed');
    expect(fin.exitCode).toBe(5);
  });

  it('killed by signal → crashed', async () => {
    const { mgr, bus, sessionRepo } = makeManager();
    const s = await mgr.startSession({ projectPath: os.tmpdir(), args: sh('sleep 5') });
    await new Promise((r) => setTimeout(r, 300));
    process.kill(s.pid!, 'SIGKILL');
    const status = await waitForTerminal(bus, s.id);
    expect(status).toBe('crashed');
    expect(sessionRepo.get(s.id)!.status).toBe('crashed');
  });

  it('stopSession → stopped', async () => {
    const { mgr, bus, sessionRepo } = makeManager();
    const s = await mgr.startSession({ projectPath: os.tmpdir(), args: sh('sleep 5') });
    await new Promise((r) => setTimeout(r, 300));
    await mgr.stopSession(s.id);
    await waitForTerminal(bus, s.id);
    expect(sessionRepo.get(s.id)!.status).toBe('stopped');
  });
});
