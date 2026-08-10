import React from 'react';

// Human-readable uptime from an ISO start time up to `now` (ms).
export function humanUptime(startedAt: string, now: number): string {
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return '—';
  const secs = Math.max(0, Math.floor((now - start) / 1000));
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// Re-render every `intervalMs` while `active`, returning the current time (ms).
export function useTicker(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs]);
  return now;
}
