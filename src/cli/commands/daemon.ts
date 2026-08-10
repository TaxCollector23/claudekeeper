import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pc from 'picocolors';
import { LOG_DIR, PID_FILE } from '../../shared/constants.js';
import { daemonReachable } from '../client.js';

function daemonEntry(): { command: string; args: string[] } {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // Prefer compiled dist entry, fall back to tsx for dev.
  const compiled = path.resolve(here, '../../daemon/index.js');
  if (fs.existsSync(compiled)) return { command: process.execPath, args: [compiled] };
  const src = path.resolve(here, '../../../src/daemon/index.ts');
  return { command: 'npx', args: ['tsx', src] };
}

export async function daemonStart() {
  if (await daemonReachable()) {
    console.log(`${pc.dim('•')} daemon already running`);
    return;
  }
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const out = fs.openSync(path.join(LOG_DIR, 'daemon.out.log'), 'a');
  const err = fs.openSync(path.join(LOG_DIR, 'daemon.err.log'), 'a');
  const { command, args } = daemonEntry();
  const child = spawn(command, args, {
    detached: true,
    stdio: ['ignore', out, err],
  });
  child.unref();
  // Wait briefly for it to come up
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 200));
    if (await daemonReachable()) {
      console.log(`${pc.green('✓')} daemon started (pid ${child.pid})`);
      return;
    }
  }
  // Daemon failed to come up. If the err log's tail mentions EADDRINUSE or the
  // friendly port-in-use line, surface it inline so the user sees an actionable
  // message instead of "check the log".
  const errLog = path.join(LOG_DIR, 'daemon.err.log');
  const tail = tailFile(errLog, 4096);
  if (tail && /EADDRINUSE|already in use/i.test(tail)) {
    const lines = tail.split('\n').filter((l) => l.trim().length > 0);
    const line =
      lines.reverse().find((l) => /already in use/i.test(l)) ??
      lines[lines.length - 1] ??
      'Port already in use';
    console.error(`${pc.red('✕')} ${line.trim()}`);
    process.exit(1);
  }
  console.error(`${pc.red('✕')} daemon didn't respond; check ${LOG_DIR}/daemon.err.log`);
  process.exit(1);
}

function tailFile(p: string, bytes: number): string | null {
  try {
    const st = fs.statSync(p);
    const start = Math.max(0, st.size - bytes);
    const fd = fs.openSync(p, 'r');
    try {
      const len = st.size - start;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, start);
      return buf.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

export async function daemonStop() {
  if (!fs.existsSync(PID_FILE)) {
    console.log(pc.dim('daemon not running'));
    return;
  }
  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
  if (!Number.isFinite(pid)) {
    fs.unlinkSync(PID_FILE);
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
    console.log(`${pc.green('✓')} sent SIGTERM to daemon (pid ${pid})`);
  } catch (err: any) {
    console.error(`${pc.red('✕')} ${err.message}`);
  }
}

export async function daemonRestart() {
  await daemonStop();
  await new Promise((r) => setTimeout(r, 500));
  await daemonStart();
}
