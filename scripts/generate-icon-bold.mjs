import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const source = path.join(root, 'public', 'brand', 'loom_icon_var6.png');

mkdirSync(publicDir, { recursive: true });
execFileSync('sips', ['-s', 'format', 'png', '-z', '512', '512', source, '--out', path.join(publicDir, 'icon-bold.png')], {
  stdio: 'ignore',
});
console.log('Generated icon-bold.png from loom_icon_var6.png');
