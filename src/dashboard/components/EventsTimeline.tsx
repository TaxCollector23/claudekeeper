import React from 'react';
import type { KeeperEvent } from '../api';

export interface TimelineEvent {
  id: number;
  type: string;
  at: string;
  summary: string;
  raw: KeeperEvent;
}

function summarize(e: KeeperEvent): string {
  switch (e.type) {
    case 'session.started': return `pid ${e.session.pid ?? '?'}`;
    case 'session.status_changed': return `→ ${e.status}`;
    case 'session.completed': return `exit ${e.exitCode}`;
    case 'session.failed': return `exit ${e.exitCode ?? '?'}${e.error ? ` · ${e.error}` : ''}`;
    case 'session.crashed': return e.error ?? 'crashed';
    case 'session.stopped': return 'stopped';
    case 'session.output': {
      const preview = e.content.replace(/\s+/g, ' ').trim().slice(0, 80);
      return `${e.stream}: ${preview}`;
    }
    default: return '';
  }
}

export function toTimelineEvent(seq: number, e: KeeperEvent): TimelineEvent | null {
  if (!('sessionId' in e)) return null;
  return {
    id: seq,
    type: e.type,
    at: new Date().toISOString(),
    summary: summarize(e),
    raw: e,
  };
}

function timeShort(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour12: false });
}

export function EventsTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return <div className="empty">No events captured yet.</div>;
  }
  return (
    <div className="timeline">
      {events.map((e) => (
        <div key={e.id} className="timeline-row">
          <span className="tl-time mono">{timeShort(e.at)}</span>
          <span className={`tl-type tl-${e.type.replace(/\./g, '-')}`}>{e.type}</span>
          <span className="tl-summary mono">{e.summary}</span>
        </div>
      ))}
    </div>
  );
}
