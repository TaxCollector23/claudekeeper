import pc from 'picocolors';
import type { Session, SessionStatus } from '../shared/types.js';

export function statusSymbol(status: SessionStatus): string {
  switch (status) {
    case 'working':
    case 'starting':
    case 'waiting':
      return pc.green('●');
    case 'completed':
      return pc.green('✓');
    case 'failed':
    case 'crashed':
      return pc.red('✕');
    case 'stopped':
      return pc.dim('○');
    case 'interrupted':
      return pc.yellow('⚠');
    default:
      return pc.dim('○');
  }
}

export function duration(session: Session): string {
  const start = new Date(session.startedAt).getTime();
  const end = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
  return humanDuration(end - start);
}

export function humanDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

export function shortId(id: string) {
  return id.length > 12 ? id.slice(0, 12) : id;
}

export function daemonNotRunningMessage(): string {
  return [
    pc.red('✕'),
    'ClaudeKeeper daemon is not running.',
    '',
    `  Start it with: ${pc.cyan('claudekeeper daemon start')}`,
    '',
  ].join('\n');
}
