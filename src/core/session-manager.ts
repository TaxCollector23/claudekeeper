import { nanoid } from 'nanoid';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type { EventBus } from './events.js';
import type { ClaudeAdapter } from './claude-adapter.js';
import type { SessionRepository, EventRepository, LogRepository } from '../database/repositories.js';
import type { SleepAssertion } from '../macos/power.js';
import type { Session, SessionStatus, LogStream } from '../shared/types.js';
import { canTransition, isTerminal } from './state-machine.js';

interface RunningEntry {
  session: Session;
  pid: number;
  logPath: string;
  holdingSleep: boolean;
  tail: LogTailer | null;
  liveMonitor: NodeJS.Timeout | null;
  /** Child handle when this session was started in the current daemon lifetime.
   * Null for sessions re-attached after a daemon restart (we only have the PID). */
  child: ChildProcess | null;
  /** True when the user has explicitly requested stop (SIGTERM sent). */
  stopRequested: boolean;
}

export interface StartSessionInput {
  projectPath: string;
  args?: string[];
}

const PID_POLL_MS = 2000;
const TAIL_POLL_MS = 500;

export class SessionManager {
  private running = new Map<string, RunningEntry>();

  constructor(
    private repo: SessionRepository,
    private events: EventRepository,
    private logs: LogRepository,
    private bus: EventBus,
    private claude: ClaudeAdapter,
    private sleep: SleepAssertion,
    private preventSleep: boolean
  ) {}

  activeCount(): number {
    return this.running.size;
  }

  listSessions(): Session[] {
    return this.repo.list();
  }

  getSession(id: string): Session | null {
    return this.repo.get(id);
  }

  tailLogs(id: string, limit?: number) {
    return this.logs.tail(id, limit);
  }

  isRunning(id: string): boolean {
    return this.running.has(id);
  }

  async startSession(input: StartSessionInput): Promise<Session> {
    assertProjectDirExists(input.projectPath);
    const id = `ck_${nanoid(12)}`;
    let session = this.repo.create({
      id,
      projectPath: input.projectPath,
      status: 'starting',
    });

    let started;
    try {
      started = await this.claude.start({ cwd: input.projectPath, args: input.args, sessionId: id });
    } catch (err: any) {
      this.transition(session, 'failed', { exitCode: null, error: err?.message });
      throw err;
    }

    this.repo.update(id, { pid: started.pid, logPath: started.logPath });
    session = { ...session, pid: started.pid, logPath: started.logPath };

    this.attachRunning(session, started.pid, started.logPath, started.child);

    this.transition(session, 'working');
    this.events.append(id, 'session.started', { pid: started.pid, executable: started.executable, logPath: started.logPath });
    this.bus.emit({ type: 'session.started', sessionId: id, session });

    return this.repo.get(id)!;
  }

  async resumeSession(id: string): Promise<Session | null> {
    const s = this.repo.get(id);
    if (!s) return null;
    if (this.running.has(id)) return s;
    assertProjectDirExists(s.projectPath);

    let started;
    if (s.claudeSessionId) {
      started = await this.claude.resume({
        cwd: s.projectPath,
        claudeSessionId: s.claudeSessionId,
        sessionId: id,
      });
    } else {
      started = await this.claude.start({ cwd: s.projectPath, sessionId: id });
    }

    this.repo.update(id, { pid: started.pid, logPath: started.logPath, status: 'working', endedAt: null });
    const updated = this.repo.get(id)!;
    this.attachRunning(updated, started.pid, started.logPath, started.child);
    this.events.append(id, 'session.resumed', { pid: started.pid });
    this.bus.emit({ type: 'session.started', sessionId: id, session: updated });
    this.bus.emit({ type: 'session.status_changed', sessionId: id, status: 'working' });
    return updated;
  }

  async stopSession(id: string): Promise<boolean> {
    const entry = this.running.get(id);
    if (!entry) return false;
    entry.stopRequested = true;
    this.repo.update(id, { status: 'stopped' });
    this.bus.emit({ type: 'session.status_changed', sessionId: id, status: 'stopped' });
    try {
      process.kill(entry.pid, 'SIGTERM');
    } catch {
      /* already dead */
    }
    setTimeout(() => {
      if (this.running.has(id)) {
        try {
          process.kill(entry.pid, 'SIGKILL');
        } catch {
          /* ignore */
        }
      }
    }, 5000).unref();
    return true;
  }

  /** Reconcile sessions left in a non-terminal state after a daemon restart. */
  reconcileOnStartup(): void {
    const active = this.repo.activeSessions();
    for (const s of active) {
      const alive =
        s.pid !== null &&
        this.processAlive(s.pid) &&
        !pidLooksReused(s.pid, s.startedAt);
      if (alive && s.pid !== null) {
        // Re-attach — Claude survived because we spawned detached.
        this.attachRunning(s, s.pid, s.logPath ?? null);
        this.events.append(s.id, 'session.reattached', { pid: s.pid });
        this.bus.emit({ type: 'session.status_changed', sessionId: s.id, status: s.status });
      } else {
        this.repo.update(s.id, {
          status: 'interrupted',
          endedAt: new Date().toISOString(),
        });
        this.events.append(s.id, 'session.interrupted', { reason: 'daemon restart, process gone' });
      }
    }
  }

  /** Wire up sleep-assertion, log tailer, exit handler, and PID poller. */
  private attachRunning(
    session: Session,
    pid: number,
    logPath: string | null,
    child: ChildProcess | null = null
  ): void {
    if (this.preventSleep) {
      this.sleep.acquire();
      this.bus.emit({ type: 'sleep_assertion.changed', active: this.sleep.active, reasons: this.sleep.reasons });
    }

    const tail = logPath
      ? new LogTailer(logPath, (chunk) => this.onOutput(session.id, 'stdout', chunk))
      : null;
    tail?.start();

    const entry: RunningEntry = {
      session,
      pid,
      logPath: logPath ?? '',
      holdingSleep: this.preventSleep,
      tail,
      liveMonitor: null,
      child,
      stopRequested: false,
    };

    // Primary exit path: when we hold the child handle (session started in this
    // daemon lifetime), the OS delivers the real exit code and signal via 'exit'
    // even though the child is detached — detach only affects survival across a
    // daemon crash, not our ability to observe the exit while we're alive.
    if (child) {
      child.on('exit', (code, signal) => this.finalize(session.id, { code, signal }));
      child.on('error', () => this.finalize(session.id, { code: null, signal: null, errored: true }));
    }

    // Fallback exit path: for sessions re-attached after a daemon restart we have
    // no child handle, so poll the PID. Also a belt-and-suspenders for the case
    // where the 'exit' event is somehow missed. finalize() is idempotent.
    const timer = setInterval(() => {
      if (!this.processAlive(pid)) {
        this.finalize(session.id);
      }
    }, PID_POLL_MS);
    timer.unref();
    entry.liveMonitor = timer;

    this.running.set(session.id, entry);
  }

  /**
   * Terminal transition for a session. Idempotent: the first caller (exit handler
   * or PID poll) claims the entry; later calls are no-ops.
   *
   * With exit info we report the true outcome: exit 0 → completed, non-zero →
   * failed (exitCode recorded), killed by a non-stop signal → crashed. Without it
   * (reconciled session detected via PID poll) we can only infer completed/stopped.
   */
  private finalize(
    id: string,
    exit?: { code: number | null; signal: NodeJS.Signals | null; errored?: boolean }
  ): void {
    const entry = this.running.get(id);
    if (!entry) return; // already finalized — claim guard
    this.running.delete(id);

    entry.tail?.stop();
    if (entry.liveMonitor) clearInterval(entry.liveMonitor);

    const isStopping = entry.stopRequested || this.repo.get(id)?.status === 'stopped';

    let finalStatus: SessionStatus;
    let exitCode: number | null = null;
    if (exit && !exit.errored) {
      exitCode = exit.code;
      const crashedBySignal =
        exit.code === null &&
        exit.signal != null &&
        exit.signal !== 'SIGTERM' &&
        exit.signal !== 'SIGINT';
      if (isStopping) finalStatus = 'stopped';
      else if (crashedBySignal) finalStatus = 'crashed';
      else if (exit.code === 0 || exit.code === null) finalStatus = 'completed';
      else finalStatus = 'failed';
    } else if (exit?.errored) {
      finalStatus = isStopping ? 'stopped' : 'crashed';
    } else {
      // No exit info: reconciled session whose PID vanished. Best-effort inference.
      finalStatus = isStopping ? 'stopped' : 'completed';
    }

    const nowIso = new Date().toISOString();
    this.repo.update(id, { status: finalStatus, endedAt: nowIso, exitCode });

    switch (finalStatus) {
      case 'completed':
        this.events.append(id, 'session.completed', { exitCode, inferred: !exit });
        this.bus.emit({ type: 'session.completed', sessionId: id, exitCode: exitCode ?? 0 });
        break;
      case 'failed':
        this.events.append(id, 'session.failed', { exitCode });
        this.bus.emit({ type: 'session.failed', sessionId: id, exitCode });
        break;
      case 'crashed':
        this.events.append(id, 'session.crashed', { signal: exit?.signal ?? null });
        this.bus.emit({ type: 'session.crashed', sessionId: id, error: exit?.signal ?? undefined });
        break;
      case 'stopped':
        this.events.append(id, 'session.stopped', {});
        this.bus.emit({ type: 'session.stopped', sessionId: id });
        break;
      default:
        break;
    }
    this.bus.emit({ type: 'session.status_changed', sessionId: id, status: finalStatus });

    if (entry.holdingSleep) {
      this.sleep.release();
      this.bus.emit({ type: 'sleep_assertion.changed', active: this.sleep.active, reasons: this.sleep.reasons });
    }
  }

  private processAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private onOutput(id: string, stream: LogStream, content: string): void {
    if (!content) return;
    this.logs.append(id, stream, content);
    this.bus.emit({ type: 'session.output', sessionId: id, stream, content });
  }

  private transition(session: Session, next: SessionStatus, extra?: { exitCode?: number | null; error?: string }): void {
    if (!canTransition(session.status, next)) {
      // still record, but don't crash — state machine is a guardrail, not a jail
    }
    const nowIso = new Date().toISOString();
    const patch: Parameters<SessionRepository['update']>[1] = { status: next };
    if (isTerminal(next)) patch.endedAt = nowIso;
    if (extra?.exitCode !== undefined) patch.exitCode = extra.exitCode;
    this.repo.update(session.id, patch);
    this.events.append(session.id, 'session.status_changed', { from: session.status, to: next });
    this.bus.emit({ type: 'session.status_changed', sessionId: session.id, status: next });
  }
}

export function assertProjectDirExists(projectPath: string): void {
  let st;
  try {
    st = fs.statSync(projectPath);
  } catch {
    throw new Error(`Project path ${projectPath} does not exist`);
  }
  if (!st.isDirectory()) {
    throw new Error(`Project path ${projectPath} does not exist`);
  }
}

/**
 * Detect if the PID has been reused by an unrelated process. Compares the
 * process's start time (via `ps -o lstart=`) against session.startedAt. If the
 * process started more than 2 minutes AFTER the session did, it's a different
 * process wearing the same PID (a common outcome after a reboot).
 *
 * On any failure (ps missing, unparseable output), returns false — we default
 * to "assume it's ours" rather than mark a live session dead by mistake.
 */
export function pidLooksReused(
  pid: number,
  sessionStartedAt: string,
  execFn: (cmd: string, args: string[]) => string = defaultExec
): boolean {
  try {
    const out = execFn('ps', ['-o', 'lstart=', '-p', String(pid)]).trim();
    if (!out) return false;
    const procStartMs = Date.parse(out);
    if (Number.isNaN(procStartMs)) return false;
    const sessionMs = Date.parse(sessionStartedAt);
    if (Number.isNaN(sessionMs)) return false;
    // 2 minutes of slack accounts for clock jitter and lstart's second-level resolution.
    return procStartMs - sessionMs > 2 * 60 * 1000;
  } catch {
    return false;
  }
}

function defaultExec(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

/**
 * Tail a growing log file: emit new bytes since our last read offset.
 * Uses fs.watch when possible for change notifications and a low-frequency
 * poll as a fallback (fs.watch is flaky on macOS for append-only files).
 */
class LogTailer {
  private offset = 0;
  private watcher: fs.FSWatcher | null = null;
  private poll: NodeJS.Timeout | null = null;
  private stopped = false;
  private reading = false;

  constructor(private path: string, private onChunk: (s: string) => void) {}

  start(): void {
    // Seed offset at the current file size so we don't re-emit historical bytes
    // on reconcile. On first spawn the file is empty so offset is 0.
    try {
      const st = fs.statSync(this.path);
      this.offset = st.size;
    } catch {
      this.offset = 0;
    }
    try {
      this.watcher = fs.watch(this.path, () => void this.drain());
    } catch {
      /* fall back to polling only */
    }
    this.poll = setInterval(() => void this.drain(), TAIL_POLL_MS);
    this.poll.unref();
    // Initial drain in case bytes appeared before start()
    void this.drain();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.watcher) {
      try { this.watcher.close(); } catch { /* ignore */ }
      this.watcher = null;
    }
    if (this.poll) {
      clearInterval(this.poll);
      this.poll = null;
    }
    // Synchronous final drain: a process that writes then exits immediately would
    // otherwise race the async poll/watch and lose its trailing output. finalize()
    // is synchronous, so we must capture the tail synchronously here.
    this.drainSync();
  }

  /** Read all bytes past the current offset synchronously. Best-effort. */
  private drainSync(): void {
    try {
      const st = fs.statSync(this.path);
      if (st.size < this.offset) this.offset = 0; // truncated/rotated
      if (st.size <= this.offset) return;
      const length = st.size - this.offset;
      const fd = fs.openSync(this.path, 'r');
      try {
        const buf = Buffer.alloc(length);
        fs.readSync(fd, buf, 0, length, this.offset);
        this.offset = st.size;
        this.onChunk(buf.toString('utf8'));
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      /* best-effort */
    }
  }

  private async drain(): Promise<void> {
    if (this.reading) return;
    this.reading = true;
    try {
      const st = await fs.promises.stat(this.path).catch(() => null);
      if (!st) return;
      if (st.size < this.offset) {
        // File was truncated/rotated — reset.
        this.offset = 0;
      }
      if (st.size <= this.offset) return;
      const fh = await fs.promises.open(this.path, 'r');
      try {
        const length = st.size - this.offset;
        const buf = Buffer.alloc(length);
        await fh.read(buf, 0, length, this.offset);
        this.offset = st.size;
        this.onChunk(buf.toString('utf8'));
      } finally {
        await fh.close();
      }
    } catch {
      /* transient — try again next tick */
    } finally {
      this.reading = false;
    }
  }
}
