import type { Session, LogLine, LogStream, SessionEventRow } from '../shared/types.js';
import type {
  CreateSessionInput,
  IEventRepository,
  ILogRepository,
  ISessionRepository,
  SessionPatch,
} from './repo-types.js';

/**
 * In-memory storage. ClaudeKeeper's shipped product keeps the Mac awake and does
 * not create managed sessions, so it needs no on-disk database — dropping SQLite
 * lets the CLI run on any modern Node (no `node:sqlite`, which is Node 24+ only).
 * State is intentionally ephemeral; the daemon is the source of truth while it runs.
 */

const nowIso = () => new Date().toISOString();
const ACTIVE = ['starting', 'working', 'waiting'];

export class MemorySessionRepository implements ISessionRepository {
  private map = new Map<string, Session>();

  create(input: CreateSessionInput): Session {
    const now = nowIso();
    const s: Session = {
      id: input.id,
      projectPath: input.projectPath,
      claudeSessionId: input.claudeSessionId ?? null,
      pid: input.pid ?? null,
      status: input.status,
      startedAt: now,
      endedAt: null,
      exitCode: null,
      logPath: input.logPath ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.map.set(s.id, { ...s });
    return { ...s };
  }

  get(id: string): Session | null {
    const s = this.map.get(id);
    return s ? { ...s } : null;
  }

  list(filter?: { status?: Session['status'] | 'active' }): Session[] {
    let arr = [...this.map.values()];
    if (filter?.status === 'active') arr = arr.filter((s) => ACTIVE.includes(s.status));
    else if (filter?.status) arr = arr.filter((s) => s.status === filter.status);
    return arr.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map((s) => ({ ...s }));
  }

  update(id: string, patch: SessionPatch): void {
    const s = this.map.get(id);
    if (!s) return;
    Object.assign(s, patch, { updatedAt: nowIso() });
  }

  activeSessions(): Session[] {
    return this.list({ status: 'active' });
  }
}

export class MemoryEventRepository implements IEventRepository {
  private arr: SessionEventRow[] = [];
  private seq = 1;

  append(sessionId: string | null, type: string, payload: unknown): void {
    this.arr.push({
      id: this.seq++,
      sessionId: sessionId ?? '',
      type,
      payload: JSON.stringify(payload ?? {}),
      createdAt: nowIso(),
    });
    if (this.arr.length > 5000) this.arr.splice(0, this.arr.length - 5000);
  }

  listForSession(sessionId: string, limit = 200): SessionEventRow[] {
    return this.arr
      .filter((e) => e.sessionId === sessionId)
      .slice(-limit)
      .reverse();
  }
}

export class MemoryLogRepository implements ILogRepository {
  private arr: LogLine[] = [];
  private seq = 1;

  append(sessionId: string, stream: LogStream, content: string): void {
    this.arr.push({ id: this.seq++, sessionId, stream, content, createdAt: nowIso() });
    if (this.arr.length > 10000) this.arr.splice(0, this.arr.length - 10000);
  }

  tail(sessionId: string, limit = 500): LogLine[] {
    return this.arr.filter((l) => l.sessionId === sessionId).slice(-limit);
  }

  purgeOlderThan(daysOld: number): number {
    if (daysOld <= 0) return 0;
    const cutoff = Date.now() - daysOld * 86_400_000;
    const before = this.arr.length;
    this.arr = this.arr.filter((l) => Date.parse(l.createdAt) >= cutoff);
    return before - this.arr.length;
  }
}
