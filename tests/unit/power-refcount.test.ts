import { vi } from 'vitest';
import { EventEmitter } from 'node:events';

// Track spawn calls
const spawnCalls: any[] = [];
const spawned: FakeChild[] = [];

class FakeChild extends EventEmitter {
  killed = false;
  killSignal: string | undefined;
  kill(signal?: string) {
    this.killed = true;
    this.killSignal = signal;
    // Simulate the process exiting after a kill
    setImmediate(() => this.emit('exit', null, signal ?? 'SIGTERM'));
    return true;
  }
}

vi.mock('node:child_process', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    spawn: (...args: any[]) => {
      spawnCalls.push(args);
      const c = new FakeChild();
      spawned.push(c);
      return c;
    },
  };
});

// Force platform to darwin so SleepAssertion actually spawns
const originalPlatform = process.platform;
beforeAll(() => {
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
});
afterAll(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
});

beforeEach(() => {
  spawnCalls.length = 0;
  spawned.length = 0;
});

// Import after mocks are set up
const { SleepAssertion } = await import('../../src/macos/power.js');

describe('SleepAssertion refcount', () => {
  it('spawns caffeinate on first acquire and increments refCount', () => {
    const s = new SleepAssertion();
    expect(s.active).toBe(false);
    expect(s.reasons).toBe(0);

    s.acquire();
    expect(s.reasons).toBe(1);
    expect(spawnCalls.length).toBe(1);
    expect(spawnCalls[0][0]).toBe('caffeinate');
    expect(spawnCalls[0][1]).toEqual(['-dimsu']);
    expect(s.active).toBe(true);
  });

  it('does not respawn on subsequent acquires', () => {
    const s = new SleepAssertion();
    s.acquire();
    s.acquire();
    s.acquire();
    expect(s.reasons).toBe(3);
    expect(spawnCalls.length).toBe(1);
    expect(s.active).toBe(true);
  });

  it('release decrements and only kills at 0', () => {
    const s = new SleepAssertion();
    s.acquire();
    s.acquire();
    const child = spawned[0]!;
    s.release();
    expect(s.reasons).toBe(1);
    expect(child.killed).toBe(false);
    expect(s.active).toBe(true);

    s.release();
    expect(s.reasons).toBe(0);
    expect(child.killed).toBe(true);
    expect(s.active).toBe(false);
  });

  it('release below 0 is safe', () => {
    const s = new SleepAssertion();
    s.release();
    s.release();
    expect(s.reasons).toBe(0);
    expect(s.active).toBe(false);
  });

  it('after release, next acquire respawns', () => {
    const s = new SleepAssertion();
    s.acquire();
    s.release();
    s.acquire();
    expect(spawnCalls.length).toBe(2);
    expect(s.active).toBe(true);
  });

  it('releaseAll resets refCount and kills the child', () => {
    const s = new SleepAssertion();
    s.acquire();
    s.acquire();
    s.acquire();
    const child = spawned[0]!;
    s.releaseAll();
    expect(s.reasons).toBe(0);
    expect(s.active).toBe(false);
    expect(child.killed).toBe(true);
  });

  it('releaseAll on an idle assertion is a no-op', () => {
    const s = new SleepAssertion();
    s.releaseAll();
    expect(s.reasons).toBe(0);
    expect(s.active).toBe(false);
    expect(spawnCalls.length).toBe(0);
  });
});
