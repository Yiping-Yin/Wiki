import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeIco } from './icon-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const appIconDir = path.join(root, 'macos-app', 'Loom', 'Assets.xcassets', 'AppIcon.appiconset');
const webSource = path.join(root, 'public', 'brand', 'loom_icon_var6.png');
const appPngSource = path.join(root, 'public', 'brand', 'loom_app_icon_macos.png');

function resize(source, size, output) {
  execFileSync('sips', ['-s', 'format', 'png', '-z', String(size), String(size), source, '--out', output], {
    stdio: 'ignore',
  });
}

mkdirSync(publicDir, { recursive: true });
mkdirSync(appIconDir, { recursive: true });

resize(webSource, 512, path.join(publicDir, 'icon.png'));
resize(webSource, 180, path.join(publicDir, 'apple-touch-icon.png'));
resize(webSource, 64, path.join(publicDir, 'favicon-64.png'));

const faviconPng = readFileSync(path.join(publicDir, 'favicon-64.png'));
writeFileSync(path.join(publicDir, 'favicon.ico'), makeIco(faviconPng, 64));

for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
  resize(appPngSource, size, path.join(appIconDir, `icon_${size}.png`));
}

console.log('Generated public icons from loom_icon_var6.png and macOS AppIcon.appiconset directly from loom_app_icon_macos.png');
