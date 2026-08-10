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
 * We authorize via the native macOS admin dialog (`osascript … with administrator
 * privileges`) rather than terminal `sudo`, so an admin user can approve it with
 * the standard password prompt. ClaudeKeeper never sees the password. It's a
 * runtime setting (does not persist across reboots), so the safe default returns
 * on its own.
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
 * Enable (on=true) or restore (on=false) lid-close stay-awake. Shows the native
 * macOS administrator dialog. Returns true only if it was authorized and applied.
 */
export function setLidCloseStayAwake(on: boolean): boolean {
  if (process.platform !== 'darwin') return false;
  const prompt =
    on
      ? 'ClaudeKeeper wants to keep your Mac awake with the lid closed'
      : 'ClaudeKeeper wants to restore normal sleep';
  const script =
    `do shell script "pmset -a disablesleep ${on ? '1' : '0'}" ` +
    `with prompt "${prompt}" with administrator privileges`;
  const res = spawnSync('osascript', ['-e', script], { stdio: ['ignore', 'ignore', 'ignore'] });
  return res.status === 0;
}
