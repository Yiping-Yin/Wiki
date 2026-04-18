import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const targets = [
  '/Applications/Loom.app',
  path.join(homedir(), 'Applications/Loom.app'),
];

for (const target of targets) {
  try {
    const stat = await fs.stat(target);
    console.log(`${target}\t${new Date(stat.mtimeMs).toISOString()}`);
  } catch {}
}
