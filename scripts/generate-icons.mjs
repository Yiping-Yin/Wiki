import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const appIconDir = path.join(root, 'macos-app', 'Loom', 'Assets.xcassets', 'AppIcon.appiconset');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function makePng(width, height, paint) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * stride;
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const i = rowStart + 1 + x * 4;
      const [r, g, b, a] = paint(x, y, width, height);
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function paintIcon(x, y, width, height) {
  const nx = x / (width - 1);
  const ny = y / (height - 1);
  const radius = width * 0.22;

  const left = x;
  const right = width - 1 - x;
  const top = y;
  const bottom = height - 1 - y;
  const dx = Math.max(radius - left, 0, radius - right, 0);
  const dy = Math.max(radius - top, 0, radius - bottom, 0);
  if (dx > 0 && dy > 0 && dx * dx + dy * dy > radius * radius) {
    return [0, 0, 0, 0];
  }

  const tl = [10, 132, 255];
  const mid = [94, 92, 230];
  const br = [191, 90, 242];
  const t = (nx + ny) / 2;
  let r = mix(mix(tl[0], mid[0], Math.min(1, t / 0.55)), br[0], Math.max(0, (t - 0.55) / 0.45));
  let g = mix(mix(tl[1], mid[1], Math.min(1, t / 0.55)), br[1], Math.max(0, (t - 0.55) / 0.45));
  let b = mix(mix(tl[2], mid[2], Math.min(1, t / 0.55)), br[2], Math.max(0, (t - 0.55) / 0.45));

  const highlightX = width * 0.33;
  const highlightY = height * 0.23;
  const hx = (x - highlightX) / (width * 0.38);
  const hy = (y - highlightY) / (height * 0.19);
  const glow = Math.exp(-(hx * hx + hy * hy) * 2.2) * 0.22;
  r = mix(r, 255, glow);
  g = mix(g, 255, glow);
  b = mix(b, 255, glow);

  const warpStart = width * 0.2265625;
  const warpGap = width * 0.078125;
  const warpTop = height * 0.34375;
  const warpBottom = height * 0.65625;
  const warpThickness = width <= 64 ? Math.max(2, width * 0.018) : Math.max(2, width * 0.01);
  const edge = width * (width <= 64 ? 0.02 : 0.012);

  for (let i = 0; i < 8; i += 1) {
    const cx = warpStart + i * warpGap;
    const line = smoothstep(warpThickness + edge, warpThickness, Math.abs(x - cx));
    const vertical = y >= warpTop && y <= warpBottom ? 1 : 0;
    const alpha = line * vertical * (width <= 64 ? 1 : 0.92);
    if (alpha > 0) {
      r = mix(r, 255, alpha);
      g = mix(g, 255, alpha);
      b = mix(b, 255, alpha);
    }
  }

  return [Math.round(r), Math.round(g), Math.round(b), 255];
}

function makeIco(pngBuffer, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry[0] = size === 256 ? 0 : size;
  entry[1] = size === 256 ? 0 : size;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(6 + 16, 12);

  return Buffer.concat([header, entry, pngBuffer]);
}

mkdirSync(publicDir, { recursive: true });
mkdirSync(appIconDir, { recursive: true });

const iconPng = makePng(512, 512, paintIcon);
const applePng = makePng(180, 180, paintIcon);
const faviconPng = makePng(64, 64, paintIcon);
const faviconIco = makeIco(faviconPng, 64);

writeFileSync(path.join(publicDir, 'icon.png'), iconPng);
writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), applePng);
writeFileSync(path.join(publicDir, 'favicon.ico'), faviconIco);

for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
  writeFileSync(path.join(appIconDir, `icon_${size}.png`), makePng(size, size, paintIcon));
}

console.log('Generated public icons and AppIcon.appiconset PNGs');
