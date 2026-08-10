import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pc from 'picocolors';
import { LOG_DIR, PID_FILE } from '../../shared/constants.js';
import { loadConfig } from '../../shared/config.js';
import { daemonReachable } from '../client.js';

/** ClaudeKeeper accent — terracotta orange (#d97757). */
const orange = (s: string) => `\x1b[38;2;217;119;87m${s}\x1b[0m`;

function daemonEntry(): { command: string; args: string[] } {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const compiled = path.resolve(here, '../../daemon/index.js');
  if (fs.existsSync(compiled)) return { command: process.execPath, args: [compiled] };
  const src = path.resolve(here, '../../../src/daemon/index.ts');
  return { command: 'npx', args: ['tsx', src] };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function daemonStart() {
  const cfg = loadConfig();
  const url = `http://${cfg.host}:${cfg.port}`;

  if (!(await daemonReachable())) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const out = fs.openSync(path.join(LOG_DIR, 'daemon.out.log'), 'a');
    const err = fs.openSync(path.join(LOG_DIR, 'daemon.err.log'), 'a');
    const { command, args } = daemonEntry();
    const child = spawn(command, args, { detached: true, stdio: ['ignore', out, err] });
    child.unref();

    let up = false;
    for (let i = 0; i < 30; i++) {
      await wait(200);
      if (await daemonReachable()) {
        up = true;
        break;
      }
    }
    if (!up) {
      const tail = tailFile(path.join(LOG_DIR, 'daemon.err.log'), 4096);
      if (tail && /EADDRINUSE|already in use/i.test(tail)) {
        const lines = tail.split('\n').filter((l) => l.trim().length > 0);
        const line = lines.reverse().find((l) => /already in use/i.test(l)) ?? 'Port already in use';
        console.error(`${pc.red('✕')} ${line.trim()}`);
        process.exit(1);
      }
      console.error(`${pc.red('✕')} couldn't start — see ${LOG_DIR}/daemon.err.log`);
      process.exit(1);
    }
  }

  console.log(`${orange('●')} ClaudeKeeper running on ${orange(url)}`);
  console.log(`  keeping your Mac awake — it won't sleep while you're away`);
}

export async function daemonStop() {
  if (!fs.existsSync(PID_FILE)) {
    console.log(pc.dim('ClaudeKeeper is not running'));
    return;
  }
  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
  if (!Number.isFinite(pid)) {
    try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
    console.log(`${orange('●')} ClaudeKeeper stopped — your Mac can sleep normally again`);
  } catch (err: any) {
    console.error(`${pc.red('✕')} ${err.message}`);
  }
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
