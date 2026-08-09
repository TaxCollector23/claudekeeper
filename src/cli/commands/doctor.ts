import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pc from 'picocolors';
import { DefaultClaudeAdapter } from '../../core/claude-adapter.js';
import { readLidState } from '../../macos/lid.js';
import { readPowerState } from '../../macos/power.js';
import { DATA_DIR, LAUNCHD_LABEL, LOG_DIR } from '../../shared/constants.js';
import { daemonReachable, api, BASE_URL } from '../client.js';

function ok(label: string) {
  console.log(`  ${pc.green('✓')} ${label}`);
}
function bad(label: string, hint?: string) {
  console.log(`  ${pc.red('✕')} ${label}`);
  if (hint) console.log(`      ${pc.dim(hint)}`);
}

export async function doctorCommand() {
  console.log('');
  console.log(pc.bold('ClaudeKeeper Doctor'));
  console.log('');
  console.log(pc.dim('Environment'));
  if (process.platform === 'darwin') ok('macOS detected');
  else bad(`platform ${process.platform} (macOS only for now)`);
  ok(`Node.js ${process.version}`);
  const claude = new DefaultClaudeAdapter();
  const claudePath = await claude.findExecutable();
  if (claudePath) ok(`Claude Code detected at ${pc.dim(claudePath)}`);
  else bad('Claude Code not found', 'Install Claude Code or add it to your PATH.');

  console.log('');
  console.log(pc.dim('Daemon'));
  const plist = path.join(os.homedir(), 'Library/LaunchAgents', `${LAUNCHD_LABEL}.plist`);
  if (fs.existsSync(plist)) ok(`launchd agent installed (${pc.dim(plist)})`);
  else bad('launchd agent not installed', `Run: scripts/install.sh`);
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

  console.log('');
  console.log(pc.dim('System'));
  const power = await readPowerState();
  ok(`power source: ${power.source}${power.batteryPercent != null ? ` (${power.batteryPercent}%)` : ''}`);
  const lid = await readLidState();
  ok(`lid state: ${lid}`);
  console.log('');
}
