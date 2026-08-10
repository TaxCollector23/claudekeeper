import React from 'react';
import type { View } from '../App';

export function Sidebar({
  view,
  onNavigate,
  connected,
}: {
  view: View;
  onNavigate: (v: View) => void;
  connected: boolean;
}) {
  const is = (name: View['name']) => view.name === name;
  return (
    <aside className="sidebar">
      <h1>ClaudeKeeper</h1>
      <div className={`conn ${connected ? 'ok' : 'err'}`}>
        <span className={`dot ${connected ? 'ok' : 'err'}`} />
        {connected ? 'connected' : 'daemon down'}
      </div>
      <nav>
        <a onClick={() => onNavigate({ name: 'overview' })} className={is('overview') ? 'active' : ''}>Overview</a>
        <a onClick={() => onNavigate({ name: 'sessions' })} className={is('sessions') ? 'active' : ''}>Sessions</a>
      </nav>
    </aside>
  );
}
