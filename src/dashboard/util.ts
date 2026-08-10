import React from 'react';
import type { Session, SessionStatus } from './api';

export const ACTIVE_STATUSES: SessionStatus[] = ['starting', 'working', 'waiting'];

export function isActive(s: Session | SessionStatus): boolean {
  const status = typeof s === 'string' ? s : s.status;
  return ACTIVE_STATUSES.includes(status);
}

export function statusDot(s: SessionStatus) {
  const cls =
    s === 'working' || s === 'starting' || s === 'waiting' ? 'ok'
    : s === 'completed' ? 'ok'
    : s === 'failed' || s === 'crashed' ? 'err'
    : s === 'interrupted' ? 'warn'
    : 'dim';
  return React.createElement('span', { className: `dot ${cls}` });
}

export function humanDuration(startedAt: string, endedAt: string | null, now?: number) {
  const s = new Date(startedAt).getTime();
  const e = endedAt ? new Date(endedAt).getTime() : (now ?? Date.now());
  const secs = Math.max(0, Math.floor((e - s) / 1000));
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60), rs = secs % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60), rm = m % 60;
  return `${h}h ${rm}m`;
}

export function projectName(p: string) {
  return p.replace(/\/$/, '').split('/').pop() ?? p;
}

// Best-effort ANSI escape stripping — no full parsing.
const ANSI_RE = /\x1b\[[0-9;?]*[ -\/]*[@-~]/g;
export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

export function useTicker(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs]);
  return now;
}
