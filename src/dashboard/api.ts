export interface SystemStatus {
  daemon: { healthy: true; startedAt: string; port: number };
  claudeInstalled: boolean;
  claudePath: string | null;
  power: { source: 'ac' | 'battery' | 'unknown'; batteryPercent: number | null; charging: boolean };
  lid: 'open' | 'closed' | 'unknown';
  sleepAssertionActive: boolean;
  lidCloseProtected: boolean;
  activeSessionCount: number;
}

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, init);
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

export const api = {
  status: () => j<SystemStatus>('/api/status'),
};

// Event names the daemon emits over SSE. We don't inspect payloads here —
// any event is simply a nudge to re-fetch /api/status.
const EVENT_TYPES = [
  'session.started', 'session.output', 'session.status_changed', 'session.completed',
  'session.failed', 'session.crashed', 'session.stopped', 'lid.changed', 'power.changed',
  'sleep_assertion.changed',
] as const;

export interface SubscribeOptions {
  onEvent: () => void;
  onOpen?: () => void;
  onError?: () => void;
}

export function subscribeEvents(opts: SubscribeOptions): () => void {
  const es = new EventSource('/api/events');
  const handler = () => opts.onEvent();
  EVENT_TYPES.forEach((t) => es.addEventListener(t, handler as EventListener));
  es.onopen = () => opts.onOpen?.();
  es.onerror = () => opts.onError?.();
  return () => es.close();
}
