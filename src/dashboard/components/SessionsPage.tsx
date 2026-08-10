import React, { useMemo, useState } from 'react';
import type { Session } from '../api';
import { SessionRow } from './SessionRow';

const FILTERS = ['all', 'working', 'waiting', 'completed', 'failed', 'stopped', 'interrupted'] as const;

export function SessionsPage({ sessions, onOpen }: { sessions: Session[]; onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState<string>('all');
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const qLower = q.trim().toLowerCase();
    return sessions.filter((s) => {
      if (filter !== 'all' && s.status !== filter) return false;
      if (qLower && !s.projectPath.toLowerCase().includes(qLower) && !s.id.toLowerCase().includes(qLower)) return false;
      return true;
    });
  }, [sessions, filter, q]);

  return (
    <>
      <div className="section-title">Sessions</div>
      <div className="toolbar">
        <input
          className="input"
          placeholder="Filter by project path or session id…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="filter-btns">
          {FILTERS.map((f) =>
            <button
              key={f}
              className={`btn${filter === f ? ' active' : ''}`}
              onClick={() => setFilter(f)}
            >{f}</button>
          )}
        </div>
      </div>
      <div className="row-count">{rows.length} of {sessions.length}</div>
      {rows.length === 0 ? <div className="empty">No sessions.</div> :
        <div className="session-list">{rows.map((s) => <SessionRow key={s.id} s={s} onOpen={onOpen} />)}</div>}
    </>
  );
}
