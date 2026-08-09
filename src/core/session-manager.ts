import { nanoid } from 'nanoid';
import type { ChildProcess } from 'node:child_process';
import type { EventBus } from './events.js';
import type { ClaudeAdapter } from './claude-adapter.js';
import type { SessionRepository, EventRepository, LogRepository } from '../database/repositories.js';
import type { SleepAssertion } from '../macos/power.js';
import type { Session, SessionStatus } from '../shared/types.js';
import { canTransition, isTerminal } from './state-machine.js';

interface RunningEntry {
  session: Session;
  child: ChildProcess;
  holdingSleep: boolean;
}

export interface StartSessionInput {
  projectPath: string;
  args?: string[];
}

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
    const id = `ck_${nanoid(12)}`;
    let session = this.repo.create({
      id,
      projectPath: input.projectPath,
      status: 'starting',
    });

    let started;
    try {
      started = await this.claude.start({ cwd: input.projectPath, args: input.args });
    } catch (err: any) {
      this.transition(session, 'failed', { exitCode: null, error: err?.message });
      throw err;
    }

    this.repo.update(id, { pid: started.pid });
    session = { ...session, pid: started.pid };

    if (this.preventSleep) {
      this.sleep.acquire();
      this.bus.emit({ type: 'sleep_assertion.changed', active: this.sleep.active, reasons: this.sleep.reasons });
    }

    const entry: RunningEntry = { session, child: started.child, holdingSleep: this.preventSleep };
    this.running.set(id, entry);

    this.transition(session, 'working');
    this.events.append(id, 'session.started', { pid: started.pid, executable: started.executable });
    this.bus.emit({ type: 'session.started', sessionId: id, session });

    started.child.stdout?.on('data', (buf: Buffer) => this.onOutput(id, 'stdout', buf.toString()));
    started.child.stderr?.on('data', (buf: Buffer) => this.onOutput(id, 'stderr', buf.toString()));

    started.child.on('exit', (code, signal) => {
      const exitCode = code ?? (signal ? 128 : null);
      const isCrash = code === null && signal !== null && signal !== 'SIGTERM' && signal !== 'SIGINT';
      const currentSession = this.repo.get(id);
      const isStopping = currentSession?.status === 'stopped';
      let finalStatus: SessionStatus;
      if (isStopping) {
        finalStatus = 'stopped';
      } else if (isCrash) {
        finalStatus = 'crashed';
      } else if (code === 0) {
        finalStatus = 'completed';
      } else {
        finalStatus = 'failed';
      }
      const nowIso = new Date().toISOString();
      this.repo.update(id, { status: finalStatus, endedAt: nowIso, exitCode });
      const s = this.repo.get(id)!;
      if (finalStatus === 'completed') {
        this.events.append(id, 'session.completed', { exitCode });
        this.bus.emit({ type: 'session.completed', sessionId: id, exitCode: exitCode ?? 0 });
      } else if (finalStatus === 'crashed') {
        this.events.append(id, 'session.crashed', { signal });
        this.bus.emit({ type: 'session.crashed', sessionId: id, error: signal ?? undefined });
      } else if (finalStatus === 'stopped') {
        this.events.append(id, 'session.stopped', {});
        this.bus.emit({ type: 'session.stopped', sessionId: id });
      } else {
        this.events.append(id, 'session.failed', { exitCode });
        this.bus.emit({ type: 'session.failed', sessionId: id, exitCode });
      }
      this.bus.emit({ type: 'session.status_changed', sessionId: id, status: finalStatus });
      const rec = this.running.get(id);
      if (rec?.holdingSleep) {
        this.sleep.release();
        this.bus.emit({ type: 'sleep_assertion.changed', active: this.sleep.active, reasons: this.sleep.reasons });
      }
      this.running.delete(id);
      void s;
    });

    started.child.on('error', (err) => {
      this.events.append(id, 'session.error', { message: err.message });
    });

    return this.repo.get(id)!;
  }

  async stopSession(id: string): Promise<boolean> {
    const entry = this.running.get(id);
    if (!entry) return false;
    this.repo.update(id, { status: 'stopped' });
    this.bus.emit({ type: 'session.status_changed', sessionId: id, status: 'stopped' });
    try {
      entry.child.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      if (this.running.has(id)) {
        try {
          entry.child.kill('SIGKILL');
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
      const alive = s.pid !== null && this.processAlive(s.pid);
      if (!alive) {
        this.repo.update(s.id, {
          status: 'interrupted',
          endedAt: new Date().toISOString(),
        });
        this.events.append(s.id, 'session.interrupted', { reason: 'daemon restart, process gone' });
      }
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

  private onOutput(id: string, stream: 'stdout' | 'stderr', content: string): void {
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
