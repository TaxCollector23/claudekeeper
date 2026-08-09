export type SessionStatus =
  | 'starting' | 'working' | 'waiting' | 'completed' | 'failed' | 'crashed' | 'stopped' | 'interrupted';

export interface Session {
  id: string;
  projectPath: string;
  claudeSessionId: string | null;
  pid: number | null;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
}

export interface SystemStatus {
  daemon: { healthy: true; startedAt: string; port: number };
  claudeInstalled: boolean;
  claudePath: string | null;
  power: { source: 'ac' | 'battery' | 'unknown'; batteryPercent: number | null; charging: boolean };
  lid: 'open' | 'closed' | 'unknown';
  sleepAssertionActive: boolean;
  activeSessionCount: number;
}

export interface LogLine { id: number; sessionId: string; stream: 'stdout' | 'stderr'; content: string; createdAt: string }

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, init);
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

export const api = {
  status: () => j<SystemStatus>('/api/status'),
  sessions: () => j<Session[]>('/api/sessions'),
  session: (id: string) => j<Session>(`/api/sessions/${id}`),
  logs: (id: string, limit = 500) => j<LogLine[]>(`/api/sessions/${id}/logs?limit=${limit}`),
  stop: (id: string) => j<{ ok: true }>(`/api/sessions/${id}/stop`, { method: 'POST' }),
};

export function subscribeEvents(onEvent: (e: any) => void): () => void {
  const es = new EventSource('/api/events');
  const handler = (msg: MessageEvent) => {
    try {
      onEvent(JSON.parse(msg.data));
    } catch { /* ignore */ }
  };
  ['session.started', 'session.output', 'session.status_changed', 'session.completed',
   'session.failed', 'session.crashed', 'session.stopped', 'lid.changed', 'power.changed',
   'sleep_assertion.changed'].forEach((t) => es.addEventListener(t, handler as EventListener));
  return () => es.close();
}
