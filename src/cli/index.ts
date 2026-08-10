import { Command } from 'commander';
import { daemonStart, daemonStop } from './commands/daemon.js';
import { uninstallCommand } from './commands/uninstall.js';

const orange = (s: string) => `\x1b[38;2;217;119;87m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

function usage(): string {
  return [
    '',
    `${orange('ClaudeKeeper')} — keep Claude working while you're away from your Mac`,
    '',
    `  ${orange('claudekeeper daemon start')}    keep your Mac awake`,
    `  ${orange('claudekeeper daemon stop')}     stop and let it sleep again`,
    `  ${orange('claudekeeper uninstall')}       remove ClaudeKeeper`,
    '',
    dim('  add --lid to daemon start to also keep working with the lid closed'),
    '',
  ].join('\n');
}

const program = new Command();
program
  .name('claudekeeper')
  .helpOption(false) // no -h/--help noise; bare `claudekeeper` prints the commands
  .configureHelp({ formatHelp: () => usage() })
  .configureOutput({ writeErr: () => {} }) // suppress commander's own error text
  .exitOverride(); // throw instead of exiting, so we can print the clean list

program.addHelpCommand(false);

const daemon = program.command('daemon');
daemon.configureHelp({ formatHelp: () => usage() });

daemon
  .command('start')
  .option('--lid', 'also keep working with the lid closed (approve the macOS admin prompt)')
  .action((opts) => daemonStart({ lid: opts.lid }));

daemon.command('stop').action(() => daemonStop());

program.command('uninstall').action(() => uninstallCommand());

// Bare `claudekeeper` (or unknown input) → print the clean command list.
program.action(() => {
  process.stdout.write(usage());
});

(async () => {
  try {
    await program.parseAsync(process.argv);
  } catch (err: any) {
    // Unknown command / bad usage → show the clean list instead of a stack trace.
    if (err?.code && String(err.code).startsWith('commander.')) {
      process.stdout.write(usage());
      process.exit(0);
    }
    console.error(err?.message ?? err);
    process.exit(1);
  }
})();
