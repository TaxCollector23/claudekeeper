import pc from 'picocolors';
import { ConfigSchema, loadConfig, saveConfig, type Config } from '../../shared/config.js';
import { CONFIG_FILE } from '../../shared/constants.js';

function die(msg: string): never {
  process.stderr.write(pc.red(msg) + '\n');
  process.exit(1);
}

function printConfig(config: Config) {
  for (const [k, v] of Object.entries(config)) {
    console.log(`  ${pc.cyan(k)}=${pc.green(String(v))}`);
  }
}

function parseValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw !== '' && !isNaN(Number(raw)) && /^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

export function configCommand(action?: string, key?: string, value?: string): void {
  const act = action ?? 'show';
  try {
    if (act === 'show') {
      const cfg = loadConfig();
      console.log('');
      console.log(pc.bold('ClaudeKeeper config'));
      console.log(pc.dim(`  ${CONFIG_FILE}`));
      console.log('');
      printConfig(cfg);
      console.log('');
      return;
    }
    if (act === 'path') {
      console.log(CONFIG_FILE);
      return;
    }
    if (act === 'get') {
      if (!key) die('Usage: claudekeeper config get <key>');
      const cfg = loadConfig() as Record<string, unknown>;
      if (!(key in cfg)) die(`Unknown config key: ${key}`);
      console.log(String(cfg[key]));
      return;
    }
    if (act === 'set') {
      if (!key || value === undefined) die('Usage: claudekeeper config set <key> <value>');
      const cfg = loadConfig() as Record<string, unknown>;
      if (!(key in ConfigSchema.shape)) die(`Unknown config key: ${key}`);
      const parsed = parseValue(value);
      const next = { ...cfg, [key]: parsed };
      const result = ConfigSchema.safeParse(next);
      if (!result.success) {
        die(`Invalid value for ${key}: ${result.error.issues.map((i) => i.message).join(', ')}`);
      }
      saveConfig(result.data);
      console.log(pc.bold('Saved config:'));
      printConfig(result.data);
      console.log('');
      console.log(pc.yellow('Restart the daemon for changes to take effect:'));
      console.log(pc.cyan('  claudekeeper daemon restart'));
      return;
    }
    die(`Unknown config action: ${act}`);
  } catch (err: any) {
    die(err?.message ?? String(err));
  }
}
