import type { SessionStatus } from '../shared/types.js';

const TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  starting: ['working', 'waiting', 'failed', 'crashed', 'stopped', 'completed'],
  working: ['waiting', 'completed', 'failed', 'crashed', 'stopped'],
  waiting: ['working', 'completed', 'failed', 'crashed', 'stopped'],
  completed: [],
  failed: [],
  crashed: ['interrupted'],
  stopped: [],
  interrupted: ['starting', 'working'],
};

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminal(status: SessionStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'crashed' || status === 'stopped';
}
