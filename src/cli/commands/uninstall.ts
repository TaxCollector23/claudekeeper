import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import pc from 'picocolors';
import { LAUNCHD_LABEL, PID_FILE } from '../../shared/constants.js';

export async function uninstallCommand() {
  console.log(pc.bold('Uninstalling ClaudeKeeper'));

  // 1. Stop the daemon.
  if (fs.existsSync(PID_FILE)) {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (Number.isFinite(pid)) {
      try {
        process.kill(pid, 'SIGTERM');
        console.log(`${pc.green('✓')} daemon stopped`);
      } catch {
        /* already gone */
      }
    }
    try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
  }

  // 3. Unload and remove the launchd agent.
  const plist = path.join(os.homedir(), 'Library/LaunchAgents', `${LAUNCHD_LABEL}.plist`);
  if (fs.existsSync(plist)) {
    spawnSync('launchctl', ['unload', plist], { stdio: 'ignore' });
    try {
      fs.unlinkSync(plist);
      console.log(`${pc.green('✓')} removed launchd agent`);
    } catch {
      console.log(`${pc.yellow('⚠')} could not remove ${plist}`);
    }
  }

  // 4. Remove the CLI symlink if we installed one.
  const link = '/usr/local/bin/claudekeeper';
  try {
    if (fs.lstatSync(link).isSymbolicLink()) {
      fs.unlinkSync(link);
      console.log(`${pc.green('✓')} removed ${link}`);
    }
  } catch {
    /* not present or not writable — ignore */
  }

  console.log('');
  console.log(`${pc.green('✓')} Uninstalled.`);
  console.log(pc.dim('  Your data at ~/Library/Application Support/ClaudeKeeper is preserved.'));
  console.log(pc.dim('  If installed via npm, remove the package with: npm rm -g @rangan23/claudekeeper'));
}
