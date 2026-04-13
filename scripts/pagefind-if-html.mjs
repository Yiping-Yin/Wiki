import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const sitePath = process.argv[2] || '.next/server/app';
const outputPath = process.argv[3] || 'public/pagefind';
const root = process.cwd();
const pagefindBin = process.platform === 'win32'
  ? path.join(root, 'node_modules', '.bin', 'pagefind.cmd')
  : path.join(root, 'node_modules', '.bin', 'pagefind');

function hasHtml(dir) {
  if (!existsSync(dir)) return false;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (hasHtml(full)) return true;
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.html') && statSync(full).size > 0) {
      return true;
    }
  }
  return false;
}

if (!hasHtml(sitePath)) {
  console.log(`pagefind: skipped (no html files under ${sitePath})`);
  process.exit(0);
}

const child = spawn(pagefindBin, ['--site', sitePath, '--output-path', outputPath], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
