import { execFile as execFileCb, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

/**
 * Admin fallback for lid-close. The primary path is the no-admin
 * `AppliesOnLidClose` assertion (see the native helper). When macOS refuses that
 * (Apple restricts it on some builds), we fall back to `sudo pmset -a disablesleep`,
 * which prompts for the password in the terminal. macOS asks — we never see it.
 */

export type LidResult = 'ok' | 'denied' | 'unavailable';

/** Read whether all-source sleep is currently disabled (no privileges needed). */
export async function readSleepDisabled(): Promise<boolean> {
  if (process.platform !== 'darwin') return false;
  try {
    const { stdout } = await execFile('pmset', ['-g']);
    const m = stdout.match(/SleepDisabled\s+(\d)/i);
    return m ? m[1] === '1' : false;
  } catch {
    return false;
  }
}

/**
 * Enable/restore lid-close via `sudo pmset -a disablesleep <0|1>`. The password
 * prompt appears in the user's terminal (stdio inherited).
 *   'ok'          — authorized and applied
 *   'denied'      — cancelled, or the user isn't an admin
 *   'unavailable' — not macOS / sudo missing
 */
export function setDisableSleepWithSudo(on: boolean): LidResult {
  if (process.platform !== 'darwin') return 'unavailable';
  const res = spawnSync('sudo', ['pmset', '-a', 'disablesleep', on ? '1' : '0'], {
    stdio: 'inherit',
  });
  if (res.error) return 'unavailable';
  return res.status === 0 ? 'ok' : 'denied';
}
