import path from 'node:path';
import pc from 'picocolors';
import { api, daemonReachable, streamEvents } from '../client.js';
import { daemonNotRunningMessage, shortId } from '../format.js';

export async function runCommand(opts: { cwd?: string; args?: string[]; detach?: boolean }) {
  if (!(await daemonReachable())) {
    process.stderr.write(daemonNotRunningMessage());
    process.exit(1);
  }
  const projectPath = path.resolve(opts.cwd ?? process.cwd());
  const session = await api.startSession(projectPath, opts.args);
  console.log(`${pc.green('●')} started session ${pc.bold(shortId(session.id))}  ${pc.dim(projectPath)}`);
  if (opts.detach) {
    console.log(pc.dim(`Detached. Follow logs with:  claudekeeper logs ${session.id}`));
    return;
  }
  console.log(pc.dim('Streaming output. Ctrl+C detaches (the session keeps running).'));
  console.log('');
  const stop = streamEvents((evt) => {
    if (evt.type === 'session.output' && evt.sessionId === session.id) {
      process.stdout.write(evt.content);
    } else if (evt.type === 'session.status_changed' && evt.sessionId === session.id) {
      if (['completed', 'failed', 'crashed', 'stopped'].includes(evt.status)) {
        console.log('');
        console.log(`${pc.dim('session')} ${pc.bold(evt.status)}`);
        stop();
        process.exit(0);
      }
    }
  });
  process.on('SIGINT', () => {
    console.log('');
    console.log(pc.dim('Detached. Session continues in daemon.'));
    stop();
    process.exit(0);
  });
}
