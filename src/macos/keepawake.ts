import { execFile as execFileCb, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

/**
 * macOS lid-close survival.
 *
 * Idle-sleep prevention needs no privileges (handled elsewhere). Keeping a
 * MacBook fully awake with the lid *closed* on the built-in display is different:
 * macOS forces sleep on lid close and only `pmset -a disablesleep 1` overrides it,
 * which requires administrator authorization. No userspace API can bypass this.
 *
 * The password prompt happens right in the terminal via `sudo` — ClaudeKeeper
 * never sees the password. It's a runtime setting (does not persist across
 * reboots), so the safe default returns on its own.
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
 * Enable (on=true) or restore (on=false) lid-close stay-awake by running
 * `sudo pmset -a disablesleep <0|1>`. The password prompt appears in the user's
 * own terminal (stdio inherited); we never see or handle it.
 *
 * Returns:
 *   'ok'          — authorized and applied
 *   'denied'      — the user cancelled or isn't allowed to run sudo (not an admin)
 *   'unavailable' — not macOS / sudo missing
 */
export function setLidCloseStayAwake(on: boolean): LidResult {
  if (process.platform !== 'darwin') return 'unavailable';
  const res = spawnSync('sudo', ['pmset', '-a', 'disablesleep', on ? '1' : '0'], {
    stdio: 'inherit',
  });
  if (res.error) return 'unavailable';
  return res.status === 0 ? 'ok' : 'denied';
}

/** Back-compat boolean helper for callers that only care about success. */
export function setLidCloseStayAwakeBool(on: boolean): boolean {
  return setLidCloseStayAwake(on) === 'ok';
}
