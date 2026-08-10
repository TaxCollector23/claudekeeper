#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

// ClaudeKeeper stores state in SQLite via the built-in `node:sqlite`, which is
// only stable (unflagged) on Node 24+. Fail early with an actionable message
// rather than a cryptic ERR_UNKNOWN_BUILTIN_MODULE deeper in the import chain.
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (Number.isFinite(nodeMajor) && nodeMajor < 24) {
  process.stderr.write(
    `ClaudeKeeper requires Node.js 24 or newer (found ${process.versions.node}).\n` +
      `It uses the built-in node:sqlite module, stable only on Node 24+.\n` +
      `Upgrade Node (e.g. \`nvm install 24 && nvm use 24\`) and retry.\n`
  );
  process.exit(1);
}

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
