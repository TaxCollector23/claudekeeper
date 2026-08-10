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

export type KeeperEvent =
  | { type: 'session.started'; sessionId: string; session: Session }
  | { type: 'session.status_changed'; sessionId: string; status: SessionStatus }
  | { type: 'session.output'; sessionId: string; stream: 'stdout' | 'stderr'; content: string }
  | { type: 'session.completed'; sessionId: string; exitCode: number }
  | { type: 'session.failed'; sessionId: string; exitCode: number | null; error?: string }
  | { type: 'session.crashed'; sessionId: string; error?: string }
  | { type: 'session.stopped'; sessionId: string }
  | { type: 'lid.changed'; state: 'open' | 'closed' | 'unknown' }
  | { type: 'power.changed'; state: SystemStatus['power'] }
  | { type: 'sleep_assertion.changed'; active: boolean; reasons: number };

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

const EVENT_TYPES = [
  'session.started', 'session.output', 'session.status_changed', 'session.completed',
  'session.failed', 'session.crashed', 'session.stopped', 'lid.changed', 'power.changed',
  'sleep_assertion.changed',
] as const;

export interface SubscribeOptions {
  onEvent: (e: KeeperEvent) => void;
  onOpen?: () => void;
  onError?: () => void;
}

export function subscribeEvents(onEvent: (e: KeeperEvent) => void): () => void;
export function subscribeEvents(opts: SubscribeOptions): () => void;
export function subscribeEvents(arg: any): () => void {
  const opts: SubscribeOptions = typeof arg === 'function' ? { onEvent: arg } : arg;
  const es = new EventSource('/api/events');
  const handler = (msg: MessageEvent) => {
    try { opts.onEvent(JSON.parse(msg.data)); } catch { /* ignore */ }
  };
  EVENT_TYPES.forEach((t) => es.addEventListener(t, handler as EventListener));
  es.onopen = () => opts.onOpen?.();
  es.onerror = () => opts.onError?.();
  return () => es.close();
}
