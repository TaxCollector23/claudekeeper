import React from 'react';
import type { Session } from '../api';
import { humanDuration, isActive, projectName, statusDot, useTicker } from '../util';

export function SessionRow({ s, onOpen }: { s: Session; onOpen: (id: string) => void }) {
  const now = useTicker(isActive(s));
  return (
    <div className="session-row" onClick={() => onOpen(s.id)}>
      <div>{statusDot(s.status)}</div>
      <div className="name">{projectName(s.projectPath)}</div>
      <div className="status">{s.status}</div>
      <div className="dur mono">{humanDuration(s.startedAt, s.endedAt, now)}</div>
      <div className="path mono">{s.projectPath}</div>
    </div>
  );
}
