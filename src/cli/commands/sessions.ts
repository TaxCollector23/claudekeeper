import pc from 'picocolors';
import { api, daemonReachable } from '../client.js';
import { daemonNotRunningMessage, duration, shortId, statusSymbol } from '../format.js';

export async function sessionsCommand(opts: { json?: boolean; filter?: string }) {
  if (!(await daemonReachable())) {
    process.stderr.write(daemonNotRunningMessage());
    process.exit(1);
  }
  let sessions = await api.sessions();
  if (opts.filter) {
    const f = opts.filter.toLowerCase();
    sessions = sessions.filter((s) => s.status === f);
  }
  if (opts.json) {
    console.log(JSON.stringify(sessions, null, 2));
    return;
  }
  if (!sessions.length) {
    console.log(pc.dim('No sessions.'));
    return;
  }
  console.log('');
  for (const s of sessions) {
    const name = s.projectPath.split('/').pop() ?? s.projectPath;
    console.log(
      `  ${statusSymbol(s.status)} ${pc.bold(name.padEnd(20))} ${s.status.padEnd(11)} ${pc.dim(duration(s).padEnd(10))} ${pc.dim(shortId(s.id))}`
    );
    console.log(`    ${pc.dim(s.projectPath)}`);
  }
  console.log('');
}
