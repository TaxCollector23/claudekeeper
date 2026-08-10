import { Command } from 'commander';
import { daemonStart, daemonStop } from './commands/daemon.js';
import { uninstallCommand } from './commands/uninstall.js';

const orange = (s: string) => `\x1b[38;2;217;119;87m${s}\x1b[0m`;

function usage(): string {
  return [
    '',
    `${orange('ClaudeKeeper')} — keep your Mac awake so Claude keeps working while you're away`,
    '',
    `  ${orange('claudekeeper daemon start')}    keep your Mac awake`,
    `  ${orange('claudekeeper daemon stop')}     let it sleep again`,
    `  ${orange('claudekeeper uninstall')}       remove ClaudeKeeper`,
    '',
  ].join('\n');
}

const program = new Command();
program
  .name('claudekeeper')
  .helpOption(false)
  .configureHelp({ formatHelp: () => usage() })
  .configureOutput({ writeErr: () => {} })
  .exitOverride();

program.addHelpCommand(false);

const daemon = program.command('daemon');
daemon.configureHelp({ formatHelp: () => usage() });
daemon.command('start').action(() => daemonStart());
daemon.command('stop').action(() => daemonStop());

program.command('uninstall').action(() => uninstallCommand());

program.action(() => {
  process.stdout.write(usage());
});

(async () => {
  try {
    await program.parseAsync(process.argv);
  } catch (err: any) {
    if (err?.code && String(err.code).startsWith('commander.')) {
      process.stdout.write(usage());
      process.exit(0);
    }
    console.error(err?.message ?? err);
    process.exit(1);
  }
})();
