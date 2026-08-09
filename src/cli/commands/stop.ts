import pc from 'picocolors';
import { api, daemonReachable } from '../client.js';
import { daemonNotRunningMessage } from '../format.js';

export async function stopCommand(id: string) {
  if (!(await daemonReachable())) {
    process.stderr.write(daemonNotRunningMessage());
    process.exit(1);
  }
  try {
    await api.stopSession(id);
    console.log(`${pc.green('✓')} stop requested for ${id}`);
  } catch (err: any) {
    console.error(`${pc.red('✕')} ${err.message}`);
    process.exit(1);
  }
}
