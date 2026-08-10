#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const compiled = path.resolve(here, '../dist/cli/index.js');
if (fs.existsSync(compiled)) {
  await import(compiled);
} else {
  // Dev fallback: run TypeScript source via tsx
  const src = path.resolve(here, '../src/cli/index.ts');
  const res = spawnSync('npx', ['tsx', src, ...process.argv.slice(2)], {
    stdio: 'inherit',
  });
  process.exit(res.status ?? 0);
}
