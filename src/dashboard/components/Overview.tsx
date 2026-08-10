import React from 'react';
import type { Session, SystemStatus } from '../api';
import { isActive } from '../util';
import { StatCard } from './StatCard';
import { SessionRow } from './SessionRow';

export function Overview({
  status,
  sessions,
  connected,
  onOpen,
}: {
  status: SystemStatus | null;
  sessions: Session[];
  connected: boolean;
  onOpen: (id: string) => void;
}) {
  const active = sessions.filter(isActive);
  const recent = sessions.filter((s) => !isActive(s)).slice(0, 8);

  const powerValue = !status ? '—'
    : status.power.source === 'ac'
      ? `AC${status.power.charging ? ' · charging' : ''}`
      : status.power.source === 'battery'
        ? `Battery ${status.power.batteryPercent ?? '?'}%`
        : 'Unknown';

  const powerTone: 'ok' | 'warn' | undefined = !status ? undefined
    : status.power.source === 'battery' && active.length > 0 ? 'warn'
    : status.power.source === 'ac' ? 'ok'
    : undefined;

  const lidHint = status?.lid === 'closed'
    ? 'closed → macOS may sleep on unsupported hardware'
    : status?.lid === 'open' ? 'open' : undefined;

  const sleepHint = status?.sleepAssertionActive
    ? 'Held while managed sessions are working. Auto-released when the last active session ends.'
    : 'Idle — no active sessions to protect.';

  return (
    <>
      <div className="section-title">System</div>
      <div className="grid">
        <StatCard
          label="Daemon"
          value={<><span className={`dot ${connected ? 'ok' : 'err'}`} /> {connected ? 'healthy' : 'unreachable'}</>}
          tone={connected ? 'ok' : 'err'}
        />
        <StatCard
          label="Claude Code"
          value={status?.claudeInstalled ? 'detected' : 'missing'}
          hint={status?.claudePath ?? undefined}
          tone={status?.claudeInstalled ? 'ok' : 'err'}
        />
        <StatCard label="Power" value={powerValue} tone={powerTone} />
        <StatCard label="Lid" value={status?.lid ?? '—'} hint={lidHint} tone={status?.lid === 'closed' ? 'warn' : undefined} />
        <StatCard
          label="Sleep protection"
          value={status?.sleepAssertionActive ? 'Active' : 'Released'}
          hint={sleepHint}
          tone={status?.sleepAssertionActive ? 'ok' : 'dim'}
        />
        <StatCard label="Active sessions" value={status?.activeSessionCount ?? 0} />
      </div>
      <div className="section-title">Active sessions</div>
      {active.length === 0 ? <div className="empty">None right now.</div> : (
        <div className="session-list">{active.map((s) => <SessionRow key={s.id} s={s} onOpen={onOpen} />)}</div>
      )}
      <div className="section-title">Recent</div>
      {recent.length === 0 ? <div className="empty">Nothing yet.</div> : (
        <div className="session-list">{recent.map((s) => <SessionRow key={s.id} s={s} onOpen={onOpen} />)}</div>
      )}
    </>
  );
}
