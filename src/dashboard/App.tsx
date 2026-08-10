import React, { useEffect, useState } from 'react';
import { api, subscribeEvents, type Session, type SystemStatus } from './api';
import { Sidebar } from './components/Sidebar';
import { Overview } from './components/Overview';
import { SessionsPage } from './components/SessionsPage';
import { SessionDetail } from './components/SessionDetail';
import { WarningBanner } from './components/WarningBanner';

export type View =
  | { name: 'overview' }
  | { name: 'sessions' }
  | { name: 'session'; id: string };

export function App() {
  const [view, setView] = useState<View>({ name: 'overview' });
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [connected, setConnected] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [s, sess] = await Promise.all([api.status(), api.sessions()]);
        if (cancelled) return;
        setStatus(s);
        setSessions(sess);
        setConnected(true);
      } catch {
        if (!cancelled) setConnected(false);
      }
    };
    load();
    const unsub = subscribeEvents({
      onEvent: () => load(),
      onOpen: () => setConnected(true),
      onError: () => setConnected(false),
    });
    const t = setInterval(load, 5000);
    return () => { cancelled = true; unsub(); clearInterval(t); };
  }, []);

  return (
    <div className="layout">
      <Sidebar view={view} onNavigate={setView} connected={connected} />
      <main className="main">
        <WarningBanner status={status} sessions={sessions} connected={connected} />
        {view.name === 'overview' && (
          <Overview
            status={status}
            sessions={sessions}
            connected={connected}
            onOpen={(id) => setView({ name: 'session', id })}
          />
        )}
        {view.name === 'sessions' && (
          <SessionsPage sessions={sessions} onOpen={(id) => setView({ name: 'session', id })} />
        )}
        {view.name === 'session' && (
          <SessionDetail id={view.id} onBack={() => setView({ name: 'sessions' })} />
        )}
      </main>
    </div>
  );
}
