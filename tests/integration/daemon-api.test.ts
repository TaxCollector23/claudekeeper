import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Redirect HOME so any module that resolves user dirs at import time stays sandboxed.
const TMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-test-'));
process.env.HOME = TMP_HOME;

import { buildServer } from '../../src/daemon/server.js';
import { EventBus } from '../../src/core/events.js';
import type { Session } from '../../src/shared/types.js';
import type { ClaudeAdapter } from '../../src/core/claude-adapter.js';

class FakeSessionManager {
  private sessions: Session[] = [];

  seed(list: Session[]) {
    this.sessions = list;
  }
  activeCount() {
    return this.sessions.filter((s) =>
      ['starting', 'working', 'waiting'].includes(s.status)
    ).length;
  }
  listSessions() {
    return this.sessions;
  }
  getSession(id: string) {
    return this.sessions.find((s) => s.id === id) ?? null;
  }
  tailLogs(id: string) {
    return [
      { id: 1, sessionId: id, stream: 'stdout' as const, content: 'hi\n', createdAt: 'now' },
    ];
  }
  async startSession(input: { projectPath: string }) {
    const s: Session = {
      id: 'new_id',
      projectPath: input.projectPath,
      claudeSessionId: null,
      pid: 1234,
      status: 'working',
      startedAt: 'now',
      endedAt: null,
      exitCode: null,
      logPath: null,
      createdAt: 'now',
      updatedAt: 'now',
    };
    this.sessions.push(s);
    return s;
  }
  async stopSession(id: string) {
    return this.sessions.some((s) => s.id === id);
  }
}

class FakeClaudeAdapter implements ClaudeAdapter {
  async findExecutable() {
    return null;
  }
  async isInstalled() {
    return false;
  }
  async start(): Promise<never> {
    throw new Error('not implemented in test');
  }
}

class FakeSleep {
  active = false;
  reasons = 0;
  acquire() {}
  release() {}
  releaseAll() {}
}

async function makeApp(seed: Session[] = []) {
  const sessions = new FakeSessionManager();
  sessions.seed(seed);
  const app = await buildServer({
    sessions: sessions as any,
    bus: new EventBus(),
    claude: new FakeClaudeAdapter(),
    sleep: new FakeSleep() as any,
    startedAt: '2025-01-01T00:00:00Z',
    port: 7777,
  });
  return { app, sessions };
}

const sample = (over: Partial<Session> = {}): Session => ({
  id: 's1',
  projectPath: '/tmp/proj',
  claudeSessionId: null,
  pid: 42,
  status: 'working',
  startedAt: 'now',
  endedAt: null,
  exitCode: null,
  logPath: null,
  createdAt: 'now',
  updatedAt: 'now',
  ...over,
});

describe('daemon HTTP API', () => {
  it('GET /api/health returns ok', async () => {
    const { app } = await makeApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/health' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true, startedAt: '2025-01-01T00:00:00Z' });
    } finally {
      await app.close();
    }
  });

  it('GET /api/status reports daemon and session shape', async () => {
    const { app } = await makeApp([sample()]);
    try {
      const res = await app.inject({ method: 'GET', url: '/api/status' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.daemon.healthy).toBe(true);
      expect(body.daemon.port).toBe(7777);
      expect(body.claudeInstalled).toBe(false);
      expect(body.claudePath).toBeNull();
      expect(body.sleepAssertionActive).toBe(false);
      expect(body.activeSessionCount).toBe(1);
    } finally {
      await app.close();
    }
  });

  it('GET /api/sessions lists sessions', async () => {
    const { app } = await makeApp([sample({ id: 'a' }), sample({ id: 'b', status: 'completed' })]);
    try {
      const res = await app.inject({ method: 'GET', url: '/api/sessions' });
      expect(res.statusCode).toBe(200);
      const list = res.json();
      expect(list.map((s: Session) => s.id)).toEqual(['a', 'b']);
    } finally {
      await app.close();
    }
  });

  it('GET /api/sessions/:id returns 404 for unknown id', async () => {
    const { app } = await makeApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/sessions/nope' });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'not_found' });
    } finally {
      await app.close();
    }
  });

  it('GET /api/sessions/:id/logs 404s for unknown session', async () => {
    const { app } = await makeApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/sessions/unknown/logs' });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'not_found' });
    } finally {
      await app.close();
    }
  });

  it('GET /api/sessions/:id/logs returns tailed logs for a known session', async () => {
    const { app } = await makeApp([sample({ id: 'z' })]);
    try {
      const res = await app.inject({ method: 'GET', url: '/api/sessions/z/logs' });
      expect(res.statusCode).toBe(200);
      const rows = res.json();
      expect(Array.isArray(rows)).toBe(true);
      expect(rows[0]).toMatchObject({ sessionId: 'z', stream: 'stdout' });
    } finally {
      await app.close();
    }
  });

  it('POST /api/sessions/:id/stop returns 404 when not running', async () => {
    const { app } = await makeApp();
    try {
      const res = await app.inject({ method: 'POST', url: '/api/sessions/nope/stop' });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'not_running' });
    } finally {
      await app.close();
    }
  });

  it('POST /api/sessions/:id/stop returns ok for a known session', async () => {
    const { app } = await makeApp([sample({ id: 'live' })]);
    try {
      const res = await app.inject({ method: 'POST', url: '/api/sessions/live/stop' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    } finally {
      await app.close();
    }
  });

  it('POST /api/sessions rejects invalid body', async () => {
    const { app } = await makeApp();
    try {
      const res = await app.inject({ method: 'POST', url: '/api/sessions', payload: {} });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('invalid_body');
    } finally {
      await app.close();
    }
  });
});
