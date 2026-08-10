import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fstatic from '@fastify/static';
import { z } from 'zod';
import type { SessionManager } from '../core/session-manager.js';
import type { EventBus } from '../core/events.js';
import type { ClaudeAdapter } from '../core/claude-adapter.js';
import type { SleepAssertion } from '../macos/power.js';
import { readPowerState } from '../macos/power.js';
import { readLidState } from '../macos/lid.js';
import type { LidState, KeeperEvent, PowerState, SystemStatus } from '../shared/types.js';

const StartSessionBody = z.object({
  projectPath: z.string(),
  args: z.array(z.string()).optional(),
});

export interface ServerDeps {
  sessions: SessionManager;
  bus: EventBus;
  claude: ClaudeAdapter;
  sleep: SleepAssertion;
  startedAt: string;
  port: number;
}

export async function buildServer(deps: ServerDeps) {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  // Tolerate empty bodies and any content-type — parameterless POSTs are common
  // in this API (stop, resume) and Node's fetch sends Content-Length: 0 without
  // a Content-Type header, which Fastify's default JSON parser rejects.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body: any, done) => {
    const s = typeof body === 'string' ? body.trim() : '';
    if (s.length === 0) return done(null, {});
    try {
      done(null, JSON.parse(s));
    } catch (err: any) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });
  app.addContentTypeParser('*', (_req, _payload, done) => done(null, {}));

  let lastPower: PowerState = { source: 'unknown', batteryPercent: null, charging: false };
  let lastLid: LidState = 'unknown';
  let lastBatteryLowEmit = 0;
  let lastActiveCount = 0;
  const BATTERY_LOW_THRESHOLD = 15;
  const BATTERY_LOW_DEBOUNCE_MS = 5 * 60 * 1000;

  const refreshSystem = async () => {
    const [power, lid] = await Promise.all([readPowerState(), readLidState()]);
    if (JSON.stringify(power) !== JSON.stringify(lastPower)) {
      lastPower = power;
      deps.bus.emit({ type: 'power.changed', state: power });
    }
    if (lid !== lastLid) {
      lastLid = lid;
      deps.bus.emit({ type: 'lid.changed', state: lid });
    }
    const activeCount = deps.sessions.activeCount();
    const transitionedToActive = lastActiveCount === 0 && activeCount > 0;
    if (transitionedToActive) lastBatteryLowEmit = 0;
    lastActiveCount = activeCount;
    if (
      activeCount > 0 &&
      lastPower.source === 'battery' &&
      lastPower.batteryPercent !== null &&
      lastPower.batteryPercent < BATTERY_LOW_THRESHOLD
    ) {
      const now = Date.now();
      if (now - lastBatteryLowEmit >= BATTERY_LOW_DEBOUNCE_MS) {
        lastBatteryLowEmit = now;
        deps.bus.emit({
          type: 'battery.low',
          batteryPercent: lastPower.batteryPercent,
          activeSessionCount: activeCount,
        });
      }
    }
  };
  await refreshSystem();
  const poller = setInterval(refreshSystem, 5000);
  poller.unref();

  app.get('/api/health', async () => ({ ok: true, startedAt: deps.startedAt }));

  app.get('/api/status', async (): Promise<SystemStatus> => {
    const claudePath = await deps.claude.findExecutable();
    return {
      daemon: { healthy: true, startedAt: deps.startedAt, port: deps.port },
      claudeInstalled: claudePath !== null,
      claudePath,
      power: lastPower,
      lid: lastLid,
      sleepAssertionActive: deps.sleep.active,
      lidCloseProtected: deps.sleep.lidCloseProtected,
      activeSessionCount: deps.sessions.activeCount(),
    };
  });

  app.get('/api/system', async () => ({ power: lastPower, lid: lastLid, sleepAssertionActive: deps.sleep.active }));
  app.get('/api/power', async () => lastPower);
  app.get('/api/lid', async () => ({ state: lastLid }));

  app.get('/api/sessions', async () => deps.sessions.listSessions());

  app.get<{ Params: { id: string } }>('/api/sessions/:id', async (req, reply) => {
    const s = deps.sessions.getSession(req.params.id);
    if (!s) {
      reply.code(404);
      return { error: 'not_found' };
    }
    return s;
  });

  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    '/api/sessions/:id/logs',
    async (req, reply) => {
      const s = deps.sessions.getSession(req.params.id);
      if (!s) {
        reply.code(404);
        return { error: 'not_found' };
      }
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 500;
      return deps.sessions.tailLogs(req.params.id, limit);
    }
  );

  app.post('/api/sessions', async (req, reply) => {
    const parsed = StartSessionBody.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_body', issues: parsed.error.issues };
    }
    try {
      const session = await deps.sessions.startSession(parsed.data);
      return session;
    } catch (err: any) {
      reply.code(500);
      return { error: err?.message ?? 'failed_to_start' };
    }
  });

  app.post<{ Params: { id: string } }>('/api/sessions/:id/resume', async (req, reply) => {
    try {
      const s = await deps.sessions.resumeSession(req.params.id);
      if (!s) {
        reply.code(404);
        return { error: 'not_found' };
      }
      return s;
    } catch (err: any) {
      reply.code(500);
      return { error: err?.message ?? 'failed_to_resume' };
    }
  });

  app.post<{ Params: { id: string } }>('/api/sessions/:id/stop', async (req, reply) => {
    const ok = await deps.sessions.stopSession(req.params.id);
    if (!ok) {
      reply.code(404);
      return { error: 'not_running' };
    }
    return { ok: true };
  });

  app.get('/api/events', (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    reply.raw.write(`: connected\n\n`);
    const unsubscribe = deps.bus.subscribe((event: KeeperEvent) => {
      reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    });
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(`: ping\n\n`);
      } catch {
        /* ignore */
      }
    }, 15000);
    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
    return reply;
  });

  // Serve the dashboard bundle if built
  const dashboardDir = resolveDashboardDir();
  if (dashboardDir && fs.existsSync(dashboardDir)) {
    await app.register(fstatic, { root: dashboardDir, prefix: '/' });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      const indexPath = path.join(dashboardDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        reply.type('text/html').send(fs.readFileSync(indexPath));
      } else {
        reply.code(404).send({ error: 'dashboard_not_built' });
      }
    });
  } else {
    app.get('/', async (_req, reply) => {
      reply.type('text/html').send(FALLBACK_HTML);
    });
  }

  return app;
}

function resolveDashboardDir(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../../dist-dashboard'),
    path.resolve(here, '../dashboard/dist'),
    path.resolve(here, '../../src/dashboard/dist'),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

const FALLBACK_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>ClaudeKeeper</title>
<style>body{background:#0b0d10;color:#c9d1d9;font-family:-apple-system,ui-sans-serif,sans-serif;padding:2rem;line-height:1.5}code{background:#161b22;padding:.15rem .4rem;border-radius:4px}</style>
</head><body>
<h1>ClaudeKeeper</h1>
<p>Daemon is running. The dashboard bundle isn't built yet.</p>
<p>Build it with <code>npm run dashboard:build</code>, then reload.</p>
<p>API health: <a href="/api/health">/api/health</a> · Status: <a href="/api/status">/api/status</a></p>
</body></html>`;
