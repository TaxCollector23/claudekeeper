import { Command } from 'commander';
import { daemonStart, daemonStop } from './commands/daemon.js';
import { uninstallCommand } from './commands/uninstall.js';

const program = new Command();
program
  .name('claudekeeper')
  .description(
    'Keep Claude working. Prevents your Mac from sleeping — including when the lid is closed — so Claude Code keeps running.'
  )
  .version('0.4.0');

const daemon = program.command('daemon').description('Manage the ClaudeKeeper daemon');

daemon
  .command('start')
  .description('Start the daemon and keep your Mac awake (no admin needed)')
  .option('--lid', 'also stay awake with the lid closed (needs admin once)')
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
