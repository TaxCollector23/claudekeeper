import pc from 'picocolors';
import open from 'open';
import { BASE_URL, daemonReachable } from '../client.js';

export async function dashboardCommand() {
  if (!(await daemonReachable())) {
    console.error(`${pc.red('✕')} Daemon isn't running — start it with:  claudekeeper daemon start`);
    process.exit(1);
  }
  console.log(`Opening ${BASE_URL}`);
  await open(BASE_URL);
}
