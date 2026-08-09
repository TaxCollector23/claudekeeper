import pc from 'picocolors';
import { api, daemonReachable, streamEvents } from '../client.js';
import { daemonNotRunningMessage } from '../format.js';

export async function logsCommand(id: string, opts: { follow?: boolean; tail?: string }) {
  if (!(await daemonReachable())) {
    process.stderr.write(daemonNotRunningMessage());
    process.exit(1);
  }
  const limit = opts.tail ? parseInt(opts.tail, 10) : 200;
  const lines = await api.logs(id, limit);
  for (const l of lines) process.stdout.write(l.content);
  if (!opts.follow) return;
  console.log(pc.dim(`\n— following (Ctrl+C to exit) —`));
  const stop = streamEvents((evt) => {
    if (evt.type === 'session.output' && evt.sessionId === id) {
      process.stdout.write(evt.content);
    }
  });
  process.on('SIGINT', () => {
    stop();
    process.exit(0);
  });
}
