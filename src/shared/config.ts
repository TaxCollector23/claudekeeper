import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { CONFIG_DIR, CONFIG_FILE, DEFAULT_HOST, DEFAULT_PORT } from './constants.js';

export const ConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(DEFAULT_PORT),
  host: z.string().default(DEFAULT_HOST),
  preventSleep: z.boolean().default(true),
  notifications: z.boolean().default(true),
  logRetentionDays: z.number().int().min(0).default(7),
  autoResume: z.boolean().default(false),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  if (!fs.existsSync(CONFIG_FILE)) return ConfigSchema.parse({});
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return ConfigSchema.parse(raw);
  } catch {
    return ConfigSchema.parse({});
  }
}

export function saveConfig(config: Config): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function ensureDirs(): void {
  for (const dir of [CONFIG_DIR, path.dirname(CONFIG_FILE)]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
