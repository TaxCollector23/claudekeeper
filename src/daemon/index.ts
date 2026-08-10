import fs from 'node:fs';
import path from 'node:path';
import {
  MemorySessionRepository,
  MemoryEventRepository,
  MemoryLogRepository,
} from '../database/memory-store.js';
import { EventBus } from '../core/events.js';
import { DefaultClaudeAdapter } from '../core/claude-adapter.js';
import { SessionManager } from '../core/session-manager.js';
import { Notifier } from '../core/notifier.js';
import { startLogRotation } from '../core/log-rotator.js';
import { SleepAssertion } from '../macos/power.js';
import { loadConfig, ensureDirs } from '../shared/config.js';
import { DATA_DIR, LOG_DIR, PID_FILE } from '../shared/constants.js';
import { buildServer } from './server.js';

async function main() {
  ensureDirs();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });

  const config = loadConfig();

  // Refuse to double-start
  if (fs.existsSync(PID_FILE)) {
    const oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (Number.isFinite(oldPid) && processAlive(oldPid) && oldPid !== process.pid) {
      console.error(`ClaudeKeeper daemon already running (pid ${oldPid}).`);
      process.exit(1);
    }
  }
  fs.writeFileSync(PID_FILE, String(process.pid));

  const sessionRepo = new MemorySessionRepository();
  const eventRepo = new MemoryEventRepository();
  const logRepo = new MemoryLogRepository();
  const bus = new EventBus();
  const claude = new DefaultClaudeAdapter();
  const sleep = new SleepAssertion();

  const sessions = new SessionManager(
    sessionRepo,
    eventRepo,
    logRepo,
    bus,
    claude,
    sleep,
    config.preventSleep
  );
  sessions.reconcileOnStartup();

  // Held for the whole daemon lifetime: keeps the Mac from sleeping while
  // ClaudeKeeper runs, so Claude Code keeps working while you're away. Needs no
  // admin (caffeinate -dimsu / IOKit idle assertion). macOS still forces sleep
  // when the lid is physically closed on the built-in display — that can't be
  // overridden without administrator privileges, so we don't pretend to.
  if (config.preventSleep) {
    sleep.acquire();
    console.log('[claudekeeper] keeping the Mac awake (no admin needed)');
  }

  const notifier = new Notifier(bus, sessionRepo, config);
  notifier.start();

  const startedAt = new Date().toISOString();
  const app = await buildServer({ sessions, bus, claude, sleep, startedAt, port: config.port });

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (err: any) {
    if (err && err.code === 'EADDRINUSE') {
      console.error(
        `Port ${config.port} is already in use. ClaudeKeeper may already be running, ` +
          `or edit "port" in ~/.config/claudekeeper/config.json to use a different port.`
      );
      try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
      process.exit(1);
    }
    throw err;
  }
  console.log(`[claudekeeper] daemon listening on http://${config.host}:${config.port}`);

  const stopLogRotation = startLogRotation(logRepo, config);

  const shutdown = async (signal: string) => {
    console.log(`[claudekeeper] received ${signal}, shutting down`);
    stopLogRotation();
    notifier.stop();
    sleep.releaseAll();
    let timedOut = false;
    const closePromise = app.close().catch(() => { /* ignore */ });
    const timeoutPromise = new Promise<void>((resolve) =>
      setTimeout(() => { timedOut = true; resolve(); }, 3000).unref()
    );
    await Promise.race([closePromise, timeoutPromise]);
    try {
      fs.unlinkSync(PID_FILE);
    } catch {
      /* ignore */
    }
    if (timedOut) console.log('[claudekeeper] forced shutdown after timeout');
    else console.log('[claudekeeper] clean shutdown');
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // Best-effort: write daemon logs to file too
  const logStream = fs.createWriteStream(path.join(LOG_DIR, 'daemon.log'), { flags: 'a' });
  const origLog = console.log.bind(console);
  const origErr = console.error.bind(console);
  console.log = (...args: any[]) => {
    logStream.write(`[${new Date().toISOString()}] ${args.join(' ')}\n`);
    origLog(...args);
  };
  console.error = (...args: any[]) => {
    logStream.write(`[${new Date().toISOString()}] ERROR ${args.join(' ')}\n`);
    origErr(...args);
  };
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

main().catch((err) => {
  console.error('[claudekeeper] fatal:', err);
  process.exit(1);
});
