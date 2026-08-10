import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import pc from 'picocolors';
import { DefaultClaudeAdapter } from '../../core/claude-adapter.js';
import { readLidState } from '../../macos/lid.js';
import { readPowerState } from '../../macos/power.js';
import { CONFIG_FILE, DATA_DIR, LAUNCHD_LABEL, LOG_DIR } from '../../shared/constants.js';
import { ConfigSchema } from '../../shared/config.js';
import { daemonReachable, api, BASE_URL } from '../client.js';

const MIN_FREE_MB = 100;

interface Tally {
  passed: number;
  warnings: number;
  errors: number;
}

function makeReporters(tally: Tally) {
  return {
    ok(label: string) {
      tally.passed++;
      console.log(`  ${pc.green('✓')} ${label}`);
    },
    warn(label: string, hint?: string) {
      tally.warnings++;
      console.log(`  ${pc.yellow('!')} ${label}`);
      if (hint) console.log(`      ${pc.dim(hint)}`);
    },
    bad(label: string, hint?: string) {
      tally.errors++;
      console.log(`  ${pc.red('✕')} ${label}`);
      if (hint) console.log(`      ${pc.dim(hint)}`);
    },
  };
}

function freeBytesForPath(p: string): number | null {
  try {
    // fs.statfsSync exists in Node 18.15+.
    const anyFs = fs as any;
    if (typeof anyFs.statfsSync === 'function') {
      const st = anyFs.statfsSync(p);
      return Number(st.bavail) * Number(st.bsize);
    }
  } catch {
    /* fall through */
  }
  try {
    const out = execFileSync('df', ['-k', p], { encoding: 'utf8' });
    const lines = out.trim().split('\n');
    const last = lines[lines.length - 1] ?? '';
    const parts = last.split(/\s+/);
    // df -k: Filesystem 1024-blocks Used Available Capacity ...
    // Available is index 3 on macOS.
    const availK = parseInt(parts[3] ?? '', 10);
    if (Number.isFinite(availK)) return availK * 1024;
  } catch {
    /* ignore */
  }
  return null;
}

export async function doctorCommand() {
  const tally: Tally = { passed: 0, warnings: 0, errors: 0 };
  const { ok, warn, bad } = makeReporters(tally);

  console.log('');
  console.log(pc.bold('ClaudeKeeper Doctor'));
  console.log('');
  console.log(pc.dim('Environment'));
  if (process.platform === 'darwin') ok('macOS detected');
  else bad(`platform ${process.platform} (macOS only for now)`);
  ok(`Node.js ${process.version}`);
  const claude = new DefaultClaudeAdapter();
  const claudePath = await claude.findExecutable();
  if (claudePath) {
    ok(`Claude Code detected at ${pc.dim(claudePath)}`);
    try {
      fs.accessSync(claudePath, fs.constants.X_OK);
      ok('Claude Code executable is runnable');
    } catch {
      bad(`Claude Code at ${claudePath} is not executable`, 'chmod +x it, or reinstall.');
    }
  } else bad('Claude Code not found', 'Install Claude Code or add it to your PATH.');

  console.log('');
  console.log(pc.dim('Config'));
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      const parsed = ConfigSchema.safeParse(raw);
      if (parsed.success) {
        ok(`config parses (${pc.dim(CONFIG_FILE)})`);
      } else {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('; ');
        bad('config validation failed', issues);
      }
    } catch (e: any) {
      bad(`config file unreadable: ${e.message}`);
    }
  } else {
    ok('config file not present (using defaults)');
  }

  console.log('');
  console.log(pc.dim('Daemon'));
  const plist = path.join(os.homedir(), 'Library/LaunchAgents', `${LAUNCHD_LABEL}.plist`);
  if (fs.existsSync(plist)) {
    ok(`launchd agent installed (${pc.dim(plist)})`);
    try {
      execFileSync('plutil', ['-lint', plist], { stdio: ['ignore', 'ignore', 'pipe'] });
      ok('launchd plist is valid');
    } catch (e: any) {
      const msg = e?.stderr?.toString?.().trim() || e?.message || 'plutil -lint failed';
      bad('launchd plist is invalid', msg);
    }
  } else bad('launchd agent not installed', `Run: scripts/install.sh`);
  if (await daemonReachable()) {
    ok(`daemon running (${BASE_URL})`);
    try {
      await api.status();
      ok('API responding');
    } catch (e: any) {
      bad(`API error: ${e.message}`);
    }
  } else bad('daemon not running', 'Run: claudekeeper daemon start');

  console.log('');
  console.log(pc.dim('Storage'));
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.accessSync(DATA_DIR, fs.constants.W_OK);
    ok(`data dir writable (${pc.dim(DATA_DIR)})`);
  } catch {
    bad('data dir not writable');
  }
  for (const [label, dir] of [
    ['data', DATA_DIR],
    ['log', LOG_DIR],
  ] as const) {
    const free = freeBytesForPath(dir);
    if (free === null) {
      warn(`could not determine free space for ${label} dir`);
    } else {
      const freeMb = Math.floor(free / (1024 * 1024));
      if (freeMb >= MIN_FREE_MB) {
        ok(`${label} dir has ${freeMb} MB free`);
      } else {
        warn(`${label} dir has only ${freeMb} MB free`, `Free at least ${MIN_FREE_MB} MB.`);
      }
    }
  }

  console.log('');
  console.log(pc.dim('System'));
  const power = await readPowerState();
  ok(`power source: ${power.source}${power.batteryPercent != null ? ` (${power.batteryPercent}%)` : ''}`);
  const lid = await readLidState();
  ok(`lid state: ${lid}`);

  console.log('');
  const sym =
    tally.errors > 0 ? pc.red('✕') : tally.warnings > 0 ? pc.yellow('!') : pc.green('✓');
  console.log(
    `${sym} ${tally.passed} check${tally.passed === 1 ? '' : 's'} passed, ` +
      `${tally.warnings} warning${tally.warnings === 1 ? '' : 's'}, ` +
      `${tally.errors} error${tally.errors === 1 ? '' : 's'}`
  );
  console.log('');
}
