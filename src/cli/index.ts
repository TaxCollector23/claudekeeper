import { Command } from 'commander';
import { daemonStart, daemonStop } from './commands/daemon.js';
import { uninstallCommand } from './commands/uninstall.js';

const orange = (s: string) => `\x1b[38;2;217;119;87m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

function usage(): string {
  const row = (cmd: string, desc: string) =>
    `  ${orange(cmd)}${' '.repeat(Math.max(2, 30 - cmd.length))}${dim(desc)}`;
  return [
    '',
    `  ${orange('ClaudeKeeper')}`,
    '',
    row('claudekeeper daemon start', 'keep your Mac awake'),
    row('claudekeeper daemon stop', 'let it sleep again'),
    row('claudekeeper uninstall', 'remove it'),
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
