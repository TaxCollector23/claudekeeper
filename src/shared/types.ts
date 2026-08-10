export type SessionStatus =
  | 'starting'
  | 'working'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'crashed'
  | 'stopped'
  | 'interrupted';

export type LidState = 'open' | 'closed' | 'unknown';
export type PowerSource = 'ac' | 'battery' | 'unknown';
export type LogStream = 'stdout' | 'stderr';

export interface Session {
  id: string;
  projectPath: string;
  claudeSessionId: string | null;
  pid: number | null;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
  logPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionEventRow {
  id: number;
  sessionId: string;
  type: string;
  payload: string;
  createdAt: string;
}

export interface LogLine {
  id: number;
  sessionId: string;
  stream: LogStream;
  content: string;
  createdAt: string;
}

export interface PowerState {
  source: PowerSource;
  batteryPercent: number | null;
  charging: boolean;
}

export interface SystemStatus {
  daemon: {
    healthy: true;
    startedAt: string;
    port: number;
  };
  claudeInstalled: boolean;
  claudePath: string | null;
  power: PowerState;
  lid: LidState;
  sleepAssertionActive: boolean;
  /** True only if the Mac will keep running with the lid physically closed
   * (the private AppliesOnLidClose assertion was honored by this macOS). */
  lidCloseProtected: boolean;
  activeSessionCount: number;
}

export type KeeperEvent =
  | { type: 'session.started'; sessionId: string; session: Session }
  | { type: 'session.status_changed'; sessionId: string; status: SessionStatus }
  | { type: 'session.output'; sessionId: string; stream: LogStream; content: string }
  | { type: 'session.completed'; sessionId: string; exitCode: number }
  | { type: 'session.failed'; sessionId: string; exitCode: number | null; error?: string }
  | { type: 'session.crashed'; sessionId: string; error?: string }
  | { type: 'session.stopped'; sessionId: string }
  | { type: 'lid.changed'; state: LidState }
  | { type: 'power.changed'; state: PowerState }
  | { type: 'sleep_assertion.changed'; active: boolean; reasons: number }
  | { type: 'battery.low'; batteryPercent: number; activeSessionCount: number };
