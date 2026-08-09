import { spawn, execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
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
 * Reference-counted sleep assertion via `caffeinate -dimsu`.
 *
 * Pragmatic v1: we hold a `caffeinate` child while any session needs to prevent sleep.
 * A dedicated native helper using IOKit assertions is planned; caffeinate is the
 * documented Apple-provided fallback and is honest about what it can and cannot do
 * (it cannot force operation with the lid closed on unsupported hardware — see LidMonitor).
 */
export class SleepAssertion {
  private child: ChildProcess | null = null;
  private refCount = 0;

  get active() {
    return this.child !== null;
  }
  get reasons() {
    return this.refCount;
  }

  acquire(): void {
    this.refCount++;
    if (!this.child && process.platform === 'darwin') {
      this.child = spawn('caffeinate', ['-dimsu'], {
        detached: false,
        stdio: 'ignore',
      });
      this.child.on('exit', () => {
        this.child = null;
      });
    }
  }

  release(): void {
    if (this.refCount > 0) this.refCount--;
    if (this.refCount === 0 && this.child) {
      try {
        this.child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      this.child = null;
    }
  }

  releaseAll(): void {
    this.refCount = 0;
    if (this.child) {
      try {
        this.child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      this.child = null;
    }
  }
}
