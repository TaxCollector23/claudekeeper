import type { Session, LogLine, LogStream, SessionStatus, SessionEventRow } from '../shared/types.js';

/** Storage interfaces. Implemented by the in-memory store (default runtime) and
 * usable by any other backend. Keeping these as interfaces lets the daemon avoid
 * a hard dependency on any particular database. */

export interface CreateSessionInput {
  id: string;
  projectPath: string;
  status: SessionStatus;
  pid?: number | null;
  claudeSessionId?: string | null;
  logPath?: string | null;
}

export type SessionPatch = Partial<
  Pick<Session, 'status' | 'pid' | 'endedAt' | 'exitCode' | 'claudeSessionId' | 'logPath'>
>;

export interface ISessionRepository {
  create(input: CreateSessionInput): Session;
  get(id: string): Session | null;
  list(filter?: { status?: SessionStatus | 'active' }): Session[];
  update(id: string, patch: SessionPatch): void;
  activeSessions(): Session[];
}

export interface IEventRepository {
  append(sessionId: string | null, type: string, payload: unknown): void;
  listForSession(sessionId: string, limit?: number): SessionEventRow[];
}

export interface ILogRepository {
  append(sessionId: string, stream: LogStream, content: string): void;
  tail(sessionId: string, limit?: number): LogLine[];
  purgeOlderThan(daysOld: number): number;
}
