// Concatenate landing/parts/*.html into a single index.html with the head + shell.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PARTS = path.join(ROOT, 'parts');

const order = [
  '01-hero.html',
  '02-manifesto.html',
  '03-howitworks.html',
  '04-commands.html',
  '05-cta.html',
  '06-footer.html',
];

const fragments = order
  .map((f) => {
    const p = path.join(PARTS, f);
    if (!fs.existsSync(p)) {
      console.warn(`! missing ${f} — skipping`);
      return '';
    }
    return `\n<!-- ==== ${f} ==== -->\n` + fs.readFileSync(p, 'utf8').trim() + '\n';
  })
  .join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ClaudeKeeper — Keep Claude working</title>
<meta name="description" content="A local macOS supervisor that keeps your Mac awake — even with the lid closed — so Claude Code keeps running when you step away.">
<meta property="og:title" content="ClaudeKeeper — Keep Claude working">
<meta property="og:description" content="Keep your Mac awake, even lid-closed, so Claude Code keeps running.">
<meta name="color-scheme" content="dark">
<link rel="stylesheet" href="base.css">
</head>
<body>
<div class="shell">
${fragments}
</div>
</body>
</html>
`;

fs.writeFileSync(path.join(ROOT, 'index.html'), html);
console.log('wrote index.html');
