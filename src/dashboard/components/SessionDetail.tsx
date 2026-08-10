import React, { useEffect, useRef, useState } from 'react';
import { api, subscribeEvents, type LogLine, type Session } from '../api';
import { humanDuration, isActive, projectName, statusDot, useTicker } from '../util';
import { StatCard } from './StatCard';
import { LogViewer } from './LogViewer';
import { EventsTimeline, toTimelineEvent, type TimelineEvent } from './EventsTimeline';

export function SessionDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [session, setSession] = useState<Session | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const seqRef = useRef(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setError(null);
    api.session(id).then((s) => mounted && setSession(s)).catch(() => mounted && setError('Session not found or daemon unreachable.'));
    api.logs(id, 500).then((l) => mounted && setLogs(l)).catch(() => {});
    const unsub = subscribeEvents((evt) => {
      if (!('sessionId' in evt) || evt.sessionId !== id) return;
      if (evt.type === 'session.output') {
        setLogs((prev) => [...prev, {
          id: Date.now() + Math.random(),
          sessionId: id,
          stream: evt.stream,
          content: evt.content,
          createdAt: new Date().toISOString(),
        } as LogLine]);
      } else if (evt.type === 'session.status_changed') {
        api.session(id).then((s) => setSession(s)).catch(() => {});
      }
      const t = toTimelineEvent(++seqRef.current, evt);
      if (t) setEvents((prev) => [t, ...prev].slice(0, 200));
    });
    return () => { mounted = false; unsub(); };
  }, [id]);

  const now = useTicker(!!session && isActive(session));

  if (error) {
    return (
      <>
        <button className="btn" onClick={onBack} style={{ marginBottom: 12 }}>← Back</button>
        <div className="empty">{error}</div>
      </>
    );
  }
  if (!session) return <div className="empty">Loading…</div>;

  return (
    <>
      <button className="btn" onClick={onBack} style={{ marginBottom: 12 }}>← Back</button>
      <div className="header-row">
        <h2>{projectName(session.projectPath)}</h2>
        <span className="path mono">{session.projectPath}</span>
      </div>
      <div className="grid" style={{ marginBottom: 12 }}>
        <StatCard label="Status" value={<>{statusDot(session.status)} {session.status}</>} />
        <StatCard label="Uptime" value={<span className="mono">{humanDuration(session.startedAt, session.endedAt, now)}</span>} />
        <StatCard label="PID" value={<span className="mono">{session.pid ?? '—'}</span>} />
        <StatCard label="Exit code" value={<span className="mono">{session.exitCode ?? '—'}</span>} />
      </div>
      {isActive(session) && (
        <button className="btn" onClick={() => api.stop(session.id)}>Stop</button>
      )}
      <div className="section-title">Live output</div>
      <LogViewer logs={logs} onClear={() => setLogs([])} />
      <div className="section-title">Events</div>
      <EventsTimeline events={events} />
    </>
  );
}
