import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  SessionManager,
  assertProjectDirExists,
  pidLooksReused,
} from '../../src/core/session-manager.js';
import { EventBus } from '../../src/core/events.js';
import type { ClaudeAdapter } from '../../src/core/claude-adapter.js';
import type { SessionRepository, EventRepository, LogRepository } from '../../src/database/repositories.js';
import type { SleepAssertion } from '../../src/macos/power.js';
import type { Session } from '../../src/shared/types.js';

describe('assertProjectDirExists', () => {
  it('throws when the path does not exist', () => {
    expect(() => assertProjectDirExists('/definitely/not/a/real/path/xyz-12345')).toThrow(
      /does not exist/
    );
  });

  it('throws when the path exists but is a file', () => {
    const tmp = path.join(os.tmpdir(), `ck-edge-${Date.now()}.txt`);
    fs.writeFileSync(tmp, 'x');
    try {
      expect(() => assertProjectDirExists(tmp)).toThrow(/does not exist/);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('passes for a real directory', () => {
    expect(() => assertProjectDirExists(os.tmpdir())).not.toThrow();
  });
});

describe('SessionManager.startSession', () => {
  function makeStubs() {
    const bus = new EventBus();
    const claude: ClaudeAdapter = {
      findExecutable: async () => '/bin/true',
      start: async () => ({ pid: 1, logPath: null, executable: '/bin/true' }),
      resume: async () => ({ pid: 1, logPath: null, executable: '/bin/true' }),
    };
    const noop = () => {};
    const sessionRepo = {
      create: () => ({} as Session),
      update: noop,
      get: () => null,
      list: () => [],
      activeSessions: () => [],
    } as unknown as SessionRepository;
    const eventRepo = { append: noop } as unknown as EventRepository;
    const logRepo = { append: noop, tail: () => [] } as unknown as LogRepository;
    const sleep = { acquire: noop, release: noop, releaseAll: noop, active: false, reasons: 0 } as unknown as SleepAssertion;
    return { bus, claude, sessionRepo, eventRepo, logRepo, sleep };
  }

  it('throws before creating a session when project path is missing', async () => {
    const { bus, claude, sessionRepo, eventRepo, logRepo, sleep } = makeStubs();
    let created = false;
    (sessionRepo as any).create = () => {
      created = true;
      return {} as Session;
    };
    const mgr = new SessionManager(sessionRepo, eventRepo, logRepo, bus, claude, sleep, false);
    await expect(
      mgr.startSession({ projectPath: '/does/not/exist/ck-edge-x' })
    ).rejects.toThrow(/does not exist/);
    expect(created).toBe(false);
  });
});

describe('pidLooksReused', () => {
  const sessionStart = '2024-01-01T00:00:00.000Z';

  it('returns true when the process started well after the session', () => {
    // Process started 10 minutes after session — must be a different process.
    const fakeExec = () => 'Mon Jan  1 00:10:00 UTC 2024';
    expect(pidLooksReused(1234, sessionStart, fakeExec)).toBe(true);
  });

  it('returns false when the process started before the session (our process)', () => {
    const fakeExec = () => 'Mon Jan  1 00:00:00 UTC 2024';
    expect(pidLooksReused(1234, sessionStart, fakeExec)).toBe(false);
  });

  it('returns false when process started only a few seconds after session (clock jitter)', () => {
    const fakeExec = () => 'Mon Jan  1 00:00:30 UTC 2024';
    expect(pidLooksReused(1234, sessionStart, fakeExec)).toBe(false);
  });

  it('returns false (assume ours) when ps fails', () => {
    const fakeExec = () => {
      throw new Error('ps missing');
    };
    expect(pidLooksReused(1234, sessionStart, fakeExec)).toBe(false);
  });

  it('returns false when ps output is unparseable', () => {
    const fakeExec = () => 'garbage output';
    expect(pidLooksReused(1234, sessionStart, fakeExec)).toBe(false);
  });

  it('returns false when ps output is empty', () => {
    const fakeExec = () => '';
    expect(pidLooksReused(1234, sessionStart, fakeExec)).toBe(false);
  });
});
