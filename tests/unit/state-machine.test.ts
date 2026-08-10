import { canTransition, isTerminal } from '../../src/core/state-machine.js';
import type { SessionStatus } from '../../src/shared/types.js';

const ALL: SessionStatus[] = [
  'starting',
  'working',
  'waiting',
  'completed',
  'failed',
  'crashed',
  'stopped',
  'interrupted',
];

const LEGAL: Record<SessionStatus, SessionStatus[]> = {
  starting: ['working', 'waiting', 'failed', 'crashed', 'stopped', 'completed'],
  working: ['waiting', 'completed', 'failed', 'crashed', 'stopped'],
  waiting: ['working', 'completed', 'failed', 'crashed', 'stopped'],
  completed: [],
  failed: [],
  crashed: ['interrupted'],
  stopped: [],
  interrupted: ['starting', 'working'],
};

describe('state-machine', () => {
  describe('canTransition', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        const shouldAllow = LEGAL[from].includes(to);
        it(`${from} -> ${to} is ${shouldAllow ? 'legal' : 'illegal'}`, () => {
          expect(canTransition(from, to)).toBe(shouldAllow);
        });
      }
    }

    it('returns false for unknown source status', () => {
      expect(canTransition('bogus' as SessionStatus, 'working')).toBe(false);
    });
  });

  describe('isTerminal', () => {
    const terminals: SessionStatus[] = ['completed', 'failed', 'crashed', 'stopped'];
    const nonTerminals: SessionStatus[] = ['starting', 'working', 'waiting', 'interrupted'];

    for (const s of terminals) {
      it(`${s} is terminal`, () => expect(isTerminal(s)).toBe(true));
    }
    for (const s of nonTerminals) {
      it(`${s} is not terminal`, () => expect(isTerminal(s)).toBe(false));
    }
  });
});
