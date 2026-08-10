import pc from 'picocolors';
import { api, daemonReachable } from '../client.js';
import { daemonNotRunningMessage } from '../format.js';

export async function resumeCommand(id: string) {
  if (!(await daemonReachable())) {
    process.stderr.write(daemonNotRunningMessage());
    process.exit(1);
  }
  try {
    const before = await api.session(id).catch(() => null);
    const session = await api.resumeSession(id);
    if (before && !before.claudeSessionId) {
      console.log(
        `${pc.yellow('!')} no Claude session id was recorded for ${id}; started a fresh Claude in ${session.projectPath}.`
      );
    } else if (before?.status === 'interrupted') {
      console.log(`${pc.green('✓')} resumed ${id} (pid ${session.pid})`);
    } else {
      console.log(`${pc.green('✓')} started Claude for ${id} (pid ${session.pid})`);
    }
  } catch (err: any) {
    console.error(`${pc.red('✕')} ${err.message}`);
    process.exit(1);
  }
}
