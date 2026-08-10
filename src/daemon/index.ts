import fs from 'node:fs';
import path from 'node:path';
import { openDatabase } from '../database/client.js';
import { EventRepository, LogRepository, SessionRepository } from '../database/repositories.js';
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

  const db = openDatabase();
  const sessionRepo = new SessionRepository(db);
  const eventRepo = new EventRepository(db);
  const logRepo = new LogRepository(db);
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

  const notifier = new Notifier(bus, sessionRepo, config);
  notifier.start();

  const startedAt = new Date().toISOString();
  const app = await buildServer({ sessions, bus, claude, sleep, startedAt, port: config.port });

  await app.listen({ host: config.host, port: config.port });
  console.log(`[claudekeeper] daemon listening on http://${config.host}:${config.port}`);

  const stopLogRotation = startLogRotation(logRepo, config);

  const shutdown = async (signal: string) => {
    console.log(`[claudekeeper] received ${signal}, shutting down`);
    stopLogRotation();
    notifier.stop();
    sleep.releaseAll();
    try {
      await app.close();
    } catch {
      /* ignore */
    }
    try {
      db.close();
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(PID_FILE);
    } catch {
      /* ignore */
    }
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
