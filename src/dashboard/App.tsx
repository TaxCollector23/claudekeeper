import React, { useEffect, useMemo, useState } from 'react';
import { api, subscribeEvents, type Session, type SystemStatus, type LogLine } from './api';

type View = { name: 'overview' } | { name: 'sessions' } | { name: 'session'; id: string };

function statusDot(s: Session['status']) {
  const cls = ['working','starting','waiting'].includes(s) ? 'ok'
    : s === 'completed' ? 'ok'
    : s === 'failed' || s === 'crashed' ? 'err'
    : s === 'interrupted' ? 'warn'
    : 'dim';
  return <span className={`dot ${cls}`} />;
}

function humanDuration(startedAt: string, endedAt: string | null) {
  const s = new Date(startedAt).getTime();
  const e = endedAt ? new Date(endedAt).getTime() : Date.now();
  const secs = Math.floor((e - s) / 1000);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60), rs = secs % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60), rm = m % 60;
  return `${h}h ${rm}m`;
}

function projectName(p: string) {
  return p.replace(/\/$/, '').split('/').pop() ?? p;
}

export function App() {
  const [view, setView] = useState<View>({ name: 'overview' });
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    const load = () => {
      api.status().then(setStatus).catch(() => {});
      api.sessions().then(setSessions).catch(() => {});
    };
    load();
    const unsub = subscribeEvents(() => load());
    const t = setInterval(load, 5000);
    return () => { unsub(); clearInterval(t); };
  }, []);

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>ClaudeKeeper</h1>
        <nav>
          <a onClick={() => setView({ name: 'overview' })} className={view.name === 'overview' ? 'active' : ''}>Overview</a>
          <a onClick={() => setView({ name: 'sessions' })} className={view.name === 'sessions' ? 'active' : ''}>Sessions</a>
        </nav>
      </aside>
      <main className="main">
        {view.name === 'overview' && <Overview status={status} sessions={sessions} onOpen={(id) => setView({ name: 'session', id })} />}
        {view.name === 'sessions' && <SessionsPage sessions={sessions} onOpen={(id) => setView({ name: 'session', id })} />}
        {view.name === 'session' && <SessionDetail id={view.id} onBack={() => setView({ name: 'sessions' })} />}
      </main>
    </div>
  );
}

function Overview({ status, sessions, onOpen }: { status: SystemStatus | null; sessions: Session[]; onOpen: (id: string) => void }) {
  const active = sessions.filter((s) => ['starting', 'working', 'waiting'].includes(s.status));
  const recent = sessions.filter((s) => !active.includes(s)).slice(0, 8);
  return (
    <>
      <div className="section-title">System</div>
      <div className="grid">
        <div className="card"><div className="label">Daemon</div><div className="value"><span className="dot ok" /> healthy</div></div>
        <div className="card"><div className="label">Claude Code</div><div className="value">{status?.claudeInstalled ? '✓ detected' : '✕ missing'}</div></div>
        <div className="card"><div className="label">Power</div><div className="value">{status?.power.source === 'ac' ? 'AC' : `Battery (${status?.power.batteryPercent ?? '?'}%)`}</div></div>
        <div className="card"><div className="label">Lid</div><div className="value">{status?.lid ?? '—'}</div></div>
        <div className="card"><div className="label">Sleep protection</div><div className="value">{status?.sleepAssertionActive ? 'Active' : 'Released'}</div></div>
        <div className="card"><div className="label">Active sessions</div><div className="value">{status?.activeSessionCount ?? 0}</div></div>
      </div>
      <div className="section-title">Active sessions</div>
      {active.length === 0 ? <div style={{ color: 'var(--dim)' }}>None right now.</div> : (
        <div className="session-list">{active.map((s) => <SessionRow key={s.id} s={s} onOpen={onOpen} />)}</div>
      )}
      <div className="section-title">Recent</div>
      {recent.length === 0 ? <div style={{ color: 'var(--dim)' }}>Nothing yet.</div> : (
        <div className="session-list">{recent.map((s) => <SessionRow key={s.id} s={s} onOpen={onOpen} />)}</div>
      )}
    </>
  );
}

function SessionRow({ s, onOpen }: { s: Session; onOpen: (id: string) => void }) {
  return (
    <div className="session-row" onClick={() => onOpen(s.id)}>
      <div>{statusDot(s.status)}</div>
      <div className="name">{projectName(s.projectPath)}</div>
      <div className="status">{s.status}</div>
      <div style={{ color: 'var(--dim)', fontSize: 12 }}>{humanDuration(s.startedAt, s.endedAt)}</div>
      <div className="path mono">{s.projectPath}</div>
    </div>
  );
}

function SessionsPage({ sessions, onOpen }: { sessions: Session[]; onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState<string>('all');
  const rows = useMemo(() => filter === 'all' ? sessions : sessions.filter((s) => s.status === filter), [sessions, filter]);
  return (
    <>
      <div className="section-title">Sessions</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {['all','working','completed','failed','stopped','interrupted'].map((f) =>
          <button key={f} className="btn" onClick={() => setFilter(f)} style={{ borderColor: filter === f ? 'var(--accent)' : undefined }}>{f}</button>
        )}
      </div>
      {rows.length === 0 ? <div style={{ color: 'var(--dim)' }}>No sessions.</div> :
        <div className="session-list">{rows.map((s) => <SessionRow key={s.id} s={s} onOpen={onOpen} />)}</div>}
    </>
  );
}

function SessionDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [session, setSession] = useState<Session | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);

  useEffect(() => {
    let mounted = true;
    api.session(id).then((s) => mounted && setSession(s)).catch(() => {});
    api.logs(id, 500).then((l) => mounted && setLogs(l)).catch(() => {});
    const unsub = subscribeEvents((evt) => {
      if (evt.type === 'session.output' && evt.sessionId === id) {
        setLogs((prev) => [...prev, { id: Date.now(), sessionId: id, stream: evt.stream, content: evt.content, createdAt: new Date().toISOString() }]);
      } else if (evt.type === 'session.status_changed' && evt.sessionId === id) {
        api.session(id).then((s) => setSession(s)).catch(() => {});
      }
    });
    return () => { mounted = false; unsub(); };
  }, [id]);

  const logRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  if (!session) return <div style={{ color: 'var(--dim)' }}>Loading…</div>;
  return (
    <>
      <button className="btn" onClick={onBack} style={{ marginBottom: 12 }}>← Back</button>
      <div className="header-row">
        <h2>{projectName(session.projectPath)}</h2>
        <span className="path mono">{session.projectPath}</span>
      </div>
      <div className="grid" style={{ marginBottom: 12 }}>
        <div className="card"><div className="label">Status</div><div className="value">{statusDot(session.status)} {session.status}</div></div>
        <div className="card"><div className="label">Uptime</div><div className="value">{humanDuration(session.startedAt, session.endedAt)}</div></div>
        <div className="card"><div className="label">PID</div><div className="value mono">{session.pid ?? '—'}</div></div>
        <div className="card"><div className="label">Exit code</div><div className="value mono">{session.exitCode ?? '—'}</div></div>
      </div>
      {['starting','working','waiting'].includes(session.status) && (
        <button className="btn" onClick={() => api.stop(session.id)}>Stop</button>
      )}
      <div className="section-title">Live output</div>
      <div className="logs mono" ref={logRef}>
        {logs.map((l) => <span key={l.id} style={{ color: l.stream === 'stderr' ? 'var(--err)' : undefined }}>{l.content}</span>)}
      </div>
    </>
  );
}
