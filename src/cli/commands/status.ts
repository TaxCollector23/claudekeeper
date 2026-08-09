import pc from 'picocolors';
import { api, daemonReachable } from '../client.js';
import { daemonNotRunningMessage, duration, shortId, statusSymbol } from '../format.js';

export async function statusCommand(opts: { json?: boolean }) {
  if (!(await daemonReachable())) {
    if (opts.json) {
      console.log(JSON.stringify({ daemon: 'stopped' }));
      process.exit(1);
    }
    process.stderr.write(daemonNotRunningMessage());
    process.exit(1);
  }
  const [status, sessions] = await Promise.all([api.status(), api.sessions()]);
  if (opts.json) {
    console.log(JSON.stringify({ status, sessions }, null, 2));
    return;
  }
  console.log('');
  console.log(pc.bold('ClaudeKeeper'));
  console.log('');
  console.log(`  Daemon       ${pc.green('●')} running`);
  console.log(`  Dashboard    http://${'127.0.0.1'}:${status.daemon.port}`);
  console.log('');
  console.log(pc.dim('  Claude sessions'));
  const active = sessions.filter((s) => ['starting', 'working', 'waiting'].includes(s.status));
  const recent = sessions.filter((s) => !active.includes(s)).slice(0, 5);
  const rows = [...active, ...recent];
  if (!rows.length) {
    console.log(pc.dim('    (none yet)'));
  } else {
    for (const s of rows) {
      const name = deriveName(s.projectPath);
      console.log(
        `  ${statusSymbol(s.status)} ${name.padEnd(20)} ${s.status.padEnd(11)} ${pc.dim(duration(s))}  ${pc.dim(shortId(s.id))}`
      );
    }
  }
  console.log('');
  console.log(pc.dim('  Power'));
  console.log(`    ${status.power.source === 'ac' ? 'AC connected' : `Battery (${status.power.batteryPercent ?? '?'}%)`}`);
  console.log(pc.dim('  Sleep'));
  console.log(`    ${status.sleepAssertionActive ? 'Assertion active' : 'Assertion released'}`);
  console.log(pc.dim('  Lid'));
  console.log(`    ${status.lid}`);
  console.log('');
}

function deriveName(p: string) {
  const parts = p.replace(/\/$/, '').split('/');
  return parts[parts.length - 1] ?? p;
}
