import { Command } from 'commander';
import { daemonStart, daemonStop } from './commands/daemon.js';
import { uninstallCommand } from './commands/uninstall.js';

const program = new Command();
program
  .name('claudekeeper')
  .description(
    'Keep Claude working. Prevents your Mac from sleeping — including when the lid is closed — so Claude Code keeps running.'
  )
  .version('0.2.0');

const daemon = program.command('daemon').description('Manage the ClaudeKeeper daemon');

daemon
  .command('start')
  .description('Start the daemon and keep the Mac awake (including with the lid closed)')
  .option('--no-lid', 'skip lid-close prevention (idle-sleep only, no sudo)')
  .action((opts) => daemonStart({ lid: opts.lid }));

daemon
  .command('stop')
  .description('Stop the daemon and restore normal sleep')
  .action(() => daemonStop());

program
  .command('uninstall')
  .description('Stop the daemon, restore sleep, and remove ClaudeKeeper')
  .action(() => uninstallCommand());

program.parseAsync(process.argv).catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
