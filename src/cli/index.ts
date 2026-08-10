import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { daemonStart, daemonStop } from './commands/daemon.js';
import { uninstallCommand } from './commands/uninstall.js';

const orange = (s: string) => `\x1b[38;2;217;119;87m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

function version(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    for (const p of ['../../package.json', '../../../package.json']) {
      try {
        const pkg = JSON.parse(readFileSync(path.resolve(here, p), 'utf8'));
        if (pkg?.name?.includes('claudekeeper') && pkg.version) return pkg.version;
      } catch { /* try next */ }
    }
  } catch { /* ignore */ }
  return 'unknown';
}

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

// Clean `--version` / -v / -V — just print the number, nothing else.
const argv = process.argv.slice(2);
const first = argv[0];
if (argv.length === 1 && first !== undefined && ['--version', '-v', '-V', 'version'].includes(first)) {
  process.stdout.write(`${version()}\n`);
  process.exit(0);
}

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
