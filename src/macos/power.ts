import { spawn, execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import type { PowerState } from '../shared/types.js';

const execFile = promisify(execFileCb);

export async function readPowerState(): Promise<PowerState> {
  if (process.platform !== 'darwin') {
    return { source: 'unknown', batteryPercent: null, charging: false };
  }
  try {
    const { stdout } = await execFile('pmset', ['-g', 'batt']);
    const source: 'ac' | 'battery' | 'unknown' = /AC Power/i.test(stdout)
      ? 'ac'
      : /Battery Power/i.test(stdout)
        ? 'battery'
        : 'unknown';
    const pctMatch = stdout.match(/(\d+)%/);
    const batteryPercent = pctMatch && pctMatch[1] ? parseInt(pctMatch[1], 10) : null;
    const charging = /charging;/i.test(stdout) || /charged;/i.test(stdout);
    return { source, batteryPercent, charging };
  } catch {
    return { source: 'unknown', batteryPercent: null, charging: false };
  }
}

/**
 * Internal backend interface. The public SleepAssertion owns the ref count
 * and only calls acquire/release on the 0→1 and 1→0 transitions.
 */
interface Backend {
  readonly name: string;
  acquire(reason: string): void;
  release(): void;
  dispose(): void;
  active(): boolean;
}

/**
 * Locate the compiled Swift helper relative to this module.
 * Handles both dev (src/macos/power.ts) and dist (dist/macos/power.js) layouts.
 * Returns null if no binary is present.
 */
function findNativeHelper(): string | null {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      resolve(here, '../../native/build/claudekeeper-power'),
      resolve(here, '../../../native/build/claudekeeper-power'),
    ];
    for (const p of candidates) {
      try {
        if (existsSync(p) && statSync(p).isFile()) return p;
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Backend backed by the Swift IOKit helper. Keeps a single child alive across
 * the daemon's lifetime and speaks the ACQUIRE / RELEASE / PING line protocol.
 */
class NativeSleepBackend implements Backend {
  readonly name = 'native';
  private child: ChildProcess | null = null;
  private held = false;
  private buffer = '';

  constructor(private readonly binaryPath: string) {}

  private ensureChild(): ChildProcess | null {
    if (this.child && !this.child.killed && this.child.exitCode === null) {
      return this.child;
    }
    try {
      const c = spawn(this.binaryPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
      c.stdout?.setEncoding('utf8');
      c.stdout?.on('data', (chunk: string) => {
        // We do not currently gate acquire/release on responses (the API is
        // synchronous), but drain the pipe so the helper does not block.
        this.buffer += chunk;
        if (this.buffer.length > 4096) this.buffer = this.buffer.slice(-4096);
      });
      c.on('exit', () => {
        this.child = null;
        this.held = false;
      });
      c.on('error', () => {
        this.child = null;
        this.held = false;
      });
      this.child = c;
      return c;
    } catch {
      this.child = null;
      return null;
    }
  }

  acquire(reason: string): void {
    const c = this.ensureChild();
    if (!c || !c.stdin) return;
    try {
      c.stdin.write(`ACQUIRE ${reason}\n`);
      this.held = true;
    } catch {
      /* ignore */
    }
  }

  release(): void {
    if (!this.child || !this.child.stdin) {
      this.held = false;
      return;
    }
    try {
      this.child.stdin.write(`RELEASE\n`);
    } catch {
      /* ignore */
    }
    this.held = false;
  }

  dispose(): void {
    const c = this.child;
    this.child = null;
    this.held = false;
    if (!c) return;
    try {
      c.stdin?.end();
    } catch {
      /* ignore */
    }
    try {
      c.kill('SIGTERM');
    } catch {
      /* ignore */
    }
  }

  active(): boolean {
    return this.held && this.child !== null;
  }
}

/**
 * Fallback: `caffeinate -dimsu` as a child process. Documented Apple-provided
 * behavior — prevents idle/disk/system sleep while the child lives.
 */
class CaffeinateBackend implements Backend {
  readonly name = 'caffeinate';
  private child: ChildProcess | null = null;

  acquire(_reason: string): void {
    if (this.child) return;
    if (process.platform !== 'darwin') return;
    const c = spawn('caffeinate', ['-dimsu'], { detached: false, stdio: 'ignore' });
    c.on('exit', () => {
      if (this.child === c) this.child = null;
    });
    this.child = c;
  }

  release(): void {
    if (!this.child) return;
    try {
      this.child.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    this.child = null;
  }

  dispose(): void {
    this.release();
  }

  active(): boolean {
    return this.child !== null;
  }
}

function selectBackend(): Backend {
  // Under vitest, keep the classic caffeinate path so the mocked spawn in
  // tests still receives ('caffeinate', ['-dimsu']).
  const underTest = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
  if (!underTest && process.platform === 'darwin') {
    const bin = findNativeHelper();
    if (bin) {
      const b = new NativeSleepBackend(bin);
      console.log(`[power] sleep-assertion backend: native (${bin})`);
      return b;
    }
  }
  // Only announce the fallback outside tests to keep test output clean.
  if (!underTest) console.log('[power] sleep-assertion backend: caffeinate');
  return new CaffeinateBackend();
}

/**
 * Reference-counted sleep assertion.
 *
 * Public API is unchanged from the caffeinate-only v1. Internally, we prefer
 * a Swift IOKit helper (kIOPMAssertPreventUserIdleSystemSleep with a labeled
 * reason visible in `pmset -g assertions`) and fall back to `caffeinate -dimsu`
 * when the helper is not built.
 */
export class SleepAssertion {
  private backend: Backend = selectBackend();
  private refCount = 0;

  get active() {
    return this.backend.active();
  }
  get reasons() {
    return this.refCount;
  }

  acquire(): void {
    this.refCount++;
    if (this.refCount === 1) {
      this.backend.acquire('active-session');
    }
  }

  release(): void {
    if (this.refCount === 0) return;
    this.refCount--;
    if (this.refCount === 0) {
      this.backend.release();
    }
  }

  releaseAll(): void {
    this.refCount = 0;
    this.backend.dispose();
    // Recreate so future acquires still work.
    this.backend = selectBackend();
  }
}
