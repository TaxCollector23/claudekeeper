import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import type { LidState } from '../shared/types.js';

const execFile = promisify(execFileCb);

/**
 * Read lid state via `ioreg`. Returns 'unknown' on non-macOS or when detection fails —
 * we prefer honesty over guessing.
 */
export async function readLidState(): Promise<LidState> {
  if (process.platform !== 'darwin') return 'unknown';
  try {
    const { stdout } = await execFile('ioreg', ['-r', '-k', 'AppleClamshellState']);
    const match = stdout.match(/"AppleClamshellState"\s*=\s*(Yes|No)/i);
    if (!match) return 'unknown';
    return match[1]!.toLowerCase() === 'yes' ? 'closed' : 'open';
  } catch {
    return 'unknown';
  }
}
