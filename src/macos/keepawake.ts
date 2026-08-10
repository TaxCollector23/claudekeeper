import { execFile as execFileCb, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

/**
 * macOS lid-close survival.
 *
 * The IOKit / `caffeinate` sleep assertions used elsewhere only prevent *idle*
 * sleep — closing the lid still forces the machine to sleep. The one reliable
 * way to keep a MacBook fully running with the lid shut (screen off, CPU and
 * your Claude process still active) is `pmset -a disablesleep 1`, which needs
 * root. We shell out to `sudo` so the password prompt goes to the user in their
 * own terminal; ClaudeKeeper never sees or handles the password.
 *
 * `disablesleep` is a runtime setting: it does not persist across reboots, so
 * the safe default is automatically restored if the machine restarts.
 */

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
 * Enable (on=true) or restore (on=false) lid-close stay-awake via
 * `sudo pmset -a disablesleep <0|1>`. Interactive: sudo prompts the user.
 * Returns true if the command succeeded (exit 0).
 */
export function setLidCloseStayAwake(on: boolean): boolean {
  if (process.platform !== 'darwin') return false;
  const res = spawnSync('sudo', ['pmset', '-a', 'disablesleep', on ? '1' : '0'], {
    stdio: 'inherit',
  });
  return res.status === 0;
}
