import { Command } from 'commander';
import { statusCommand } from './commands/status.js';
import { runCommand } from './commands/run.js';
import { sessionsCommand } from './commands/sessions.js';
import { logsCommand } from './commands/logs.js';
import { stopCommand } from './commands/stop.js';
import { doctorCommand } from './commands/doctor.js';
import { dashboardCommand } from './commands/dashboard.js';
import { daemonRestart, daemonStart, daemonStop } from './commands/daemon.js';

const program = new Command();
program
  .name('claudekeeper')
  .description('Local supervisor for Claude Code. Keep Claude working.')
  .version('0.1.0');

program
  .command('status')
  .description('Show daemon, sessions, power, and sleep state')
  .option('--json', 'output JSON')
  .action((opts) => statusCommand(opts));

program
  .command('run')
  .description('Start a managed Claude Code session in the current directory')
  .option('-C, --cwd <path>', 'project path (defaults to cwd)')
  .option('-d, --detach', 'return immediately after starting')
  .allowUnknownOption(true)
  .action((opts, cmd) => {
    // any positional after `--` becomes args to claude
    const args = cmd.args ?? [];
    return runCommand({ cwd: opts.cwd, detach: opts.detach, args });
  });

program
  .command('sessions')
  .description('List sessions')
  .option('--json', 'output JSON')
  .option('--filter <status>', 'filter by status (working, completed, failed, stopped, ...)')
  .action((opts) => sessionsCommand(opts));

program
  .command('logs <sessionId>')
  .description('Show logs for a session')
  .option('-f, --follow', 'stream live output')
  .option('-n, --tail <lines>', 'number of tail lines (default 200)')
  .action((id, opts) => logsCommand(id, opts));

program
  .command('stop <sessionId>')
  .description('Stop a running session')
  .action((id) => stopCommand(id));

program.command('doctor').description('Diagnose the environment').action(() => doctorCommand());
program.command('dashboard').description('Open the local dashboard').action(() => dashboardCommand());

const daemon = program.command('daemon').description('Manage the ClaudeKeeper daemon');
daemon.command('start').action(() => daemonStart());
daemon.command('stop').action(() => daemonStop());
daemon.command('restart').action(() => daemonRestart());

program.parseAsync(process.argv).catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
