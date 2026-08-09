import type { DB } from './client.js';
import type { LogLine, LogStream, Session, SessionEventRow, SessionStatus } from '../shared/types.js';

function nowIso() {
  return new Date().toISOString();
}

function rowToSession(r: any): Session {
  return {
    id: r.id,
    projectPath: r.project_path,
    claudeSessionId: r.claude_session_id,
    pid: r.pid,
    status: r.status,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    exitCode: r.exit_code,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class SessionRepository {
  constructor(private db: DB) {}

  create(input: {
    id: string;
    projectPath: string;
    status: SessionStatus;
    pid?: number | null;
    claudeSessionId?: string | null;
  }): Session {
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO sessions (id, project_path, claude_session_id, pid, status, started_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id,
        input.projectPath,
        input.claudeSessionId ?? null,
        input.pid ?? null,
        input.status,
        now,
        now,
        now
      );
    return this.get(input.id)!;
  }

  get(id: string): Session | null {
    const row = this.db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id);
    return row ? rowToSession(row) : null;
  }

  list(filter?: { status?: SessionStatus | 'active' }): Session[] {
    let sql = `SELECT * FROM sessions`;
    const params: any[] = [];
    if (filter?.status === 'active') {
      sql += ` WHERE status IN ('starting','working','waiting')`;
    } else if (filter?.status) {
      sql += ` WHERE status = ?`;
      params.push(filter.status);
    }
    sql += ` ORDER BY started_at DESC LIMIT 500`;
    return this.db.prepare(sql).all(...params).map(rowToSession);
  }

  update(
    id: string,
    patch: Partial<Pick<Session, 'status' | 'pid' | 'endedAt' | 'exitCode' | 'claudeSessionId'>>
  ): void {
    const fields: string[] = [];
    const params: any[] = [];
    if (patch.status !== undefined) {
      fields.push('status = ?');
      params.push(patch.status);
    }
    if (patch.pid !== undefined) {
      fields.push('pid = ?');
      params.push(patch.pid);
    }
    if (patch.endedAt !== undefined) {
      fields.push('ended_at = ?');
      params.push(patch.endedAt);
    }
    if (patch.exitCode !== undefined) {
      fields.push('exit_code = ?');
      params.push(patch.exitCode);
    }
    if (patch.claudeSessionId !== undefined) {
      fields.push('claude_session_id = ?');
      params.push(patch.claudeSessionId);
    }
    if (!fields.length) return;
    fields.push('updated_at = ?');
    params.push(nowIso());
    params.push(id);
    this.db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  }

  activeSessions(): Session[] {
    return this.list({ status: 'active' });
  }
}

export class EventRepository {
  constructor(private db: DB) {}

  append(sessionId: string | null, type: string, payload: unknown): void {
    this.db
      .prepare(`INSERT INTO events (session_id, type, payload, created_at) VALUES (?, ?, ?, ?)`)
      .run(sessionId, type, JSON.stringify(payload ?? {}), nowIso());
  }

  listForSession(sessionId: string, limit = 200): SessionEventRow[] {
    return this.db
      .prepare(`SELECT * FROM events WHERE session_id = ? ORDER BY id DESC LIMIT ?`)
      .all(sessionId, limit)
      .map((r: any) => ({
        id: r.id,
        sessionId: r.session_id,
        type: r.type,
        payload: r.payload,
        createdAt: r.created_at,
      }));
  }
}

export class LogRepository {
  constructor(private db: DB) {}

  append(sessionId: string, stream: LogStream, content: string): void {
    this.db
      .prepare(`INSERT INTO logs (session_id, stream, content, created_at) VALUES (?, ?, ?, ?)`)
      .run(sessionId, stream, content, nowIso());
  }

  tail(sessionId: string, limit = 500): LogLine[] {
    const rows = this.db
      .prepare(`SELECT * FROM logs WHERE session_id = ? ORDER BY id DESC LIMIT ?`)
      .all(sessionId, limit) as any[];
    return rows
      .reverse()
      .map((r) => ({
        id: r.id,
        sessionId: r.session_id,
        stream: r.stream,
        content: r.content,
        createdAt: r.created_at,
      }));
  }

  purgeOlderThan(daysOld: number): number {
    if (daysOld <= 0) return 0;
    const cutoff = new Date(Date.now() - daysOld * 86400_000).toISOString();
    const res = this.db.prepare(`DELETE FROM logs WHERE created_at < ?`).run(cutoff);
    return Number(res.changes);
  }
}
