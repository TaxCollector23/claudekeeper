import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pc from 'picocolors';
import { LOG_DIR, PID_FILE } from '../../shared/constants.js';
import { loadConfig } from '../../shared/config.js';
import { daemonReachable } from '../client.js';
import { readSleepDisabled, setDisableSleepWithSudo } from '../../macos/keepawake.js';

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

export async function daemonStart(opts: { lid?: boolean } = {}) {
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

  console.log(`${orange('●')} ${orange('ClaudeKeeper')} running on ${orange(url)}`);

  const lid = await lidCloseStatus(url);

  // The daemon already holds the no-admin AppliesOnLidClose assertion. Where macOS
  // honors it (many versions), the lid can close with no password at all.
  if (lid === true) {
    console.log(`  ${orange('close the lid and walk away')} — Claude keeps working`);
    return;
  }

  // Only when the user explicitly opts in (--lid) do we ask for a password — never
  // as a surprise on a normal start.
  if (opts.lid && lid === false && process.platform === 'darwin') {
    console.log(pc.dim('  To also keep working with the lid closed, macOS needs your password:'));
    const r = setDisableSleepWithSudo(true);
    if (r === 'ok') {
      console.log(`  ${orange('close the lid and walk away')} — Claude keeps working`);
      return;
    }
  }

  console.log(`  keeping your Mac awake — it won't sleep while you're away`);
  if (lid === false && !opts.lid) {
    console.log(pc.dim('  (to also work with the lid closed on this Mac: claudekeeper daemon start --lid)'));
  }
}

/** Ask the daemon whether lid-close protection is active. null = unknown. */
async function lidCloseStatus(baseUrl: string): Promise<boolean | null> {
  try {
    const res = await fetch(`${baseUrl}/api/status`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return null;
    const s: any = await res.json();
    return typeof s?.lidCloseProtected === 'boolean' ? s.lidCloseProtected : null;
  } catch {
    return null;
  }
}

export async function daemonStop() {
  // If we used the admin fallback (pmset disablesleep), restore normal sleep so
  // the Mac isn't left permanently awake. Only prompts if it was actually set.
  if (process.platform === 'darwin' && (await readSleepDisabled())) {
    console.log(pc.dim('Restoring normal sleep — macOS may ask for your password:'));
    setDisableSleepWithSudo(false);
  }

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
    console.log(`${orange('●')} ${orange('ClaudeKeeper')} stopped — your Mac can sleep normally again`);
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
