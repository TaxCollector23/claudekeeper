import { loadConfig } from '../shared/config.js';
import type { Session, SystemStatus, LogLine } from '../shared/types.js';

const cfg = loadConfig();
export const BASE_URL = `http://${cfg.host}:${cfg.port}`;

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const bodyStr = typeof init?.body === 'string' ? init.body : undefined;
  const hasBody = bodyStr !== undefined && bodyStr.length > 0;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${path} → ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function daemonReachable(): Promise<boolean> {
  try {
    await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(600) });
    return true;
  } catch {
    return false;
  }
}

export const api = {
  status: () => req<SystemStatus>('/api/status'),
  sessions: () => req<Session[]>('/api/sessions'),
  session: (id: string) => req<Session>(`/api/sessions/${id}`),
  logs: (id: string, limit = 500) => req<LogLine[]>(`/api/sessions/${id}/logs?limit=${limit}`),
  startSession: (projectPath: string, args?: string[]) =>
    req<Session>('/api/sessions', { method: 'POST', body: JSON.stringify({ projectPath, args }) }),
  stopSession: (id: string) =>
    req<{ ok: true }>(`/api/sessions/${id}/stop`, {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    }),
  resumeSession: (id: string) =>
    req<Session>(`/api/sessions/${id}/resume`, {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    }),
};

export function streamEvents(onEvent: (data: any) => void): () => void {
  const controller = new AbortController();
  (async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/events`, {
        signal: controller.signal,
        headers: { Accept: 'text/event-stream' },
      });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of chunk.split('\n')) {
            if (line.startsWith('data:')) {
              try {
                onEvent(JSON.parse(line.slice(5).trim()));
              } catch {
                /* ignore */
              }
            }
          }
        }
      }
    } catch {
      /* stream ended */
    }
  })();
  return () => controller.abort();
}
