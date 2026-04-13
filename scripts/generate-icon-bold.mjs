import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');

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
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
    }
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function mix(a, b, t) { return a + (b - a) * t; }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
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
  if (dx > 0 && dy > 0 && dx * dx + dy * dy > radius * radius) return [0, 0, 0, 0];

  const tl = [7, 13, 26];
  const mid = [31, 79, 208];
  const br = [139, 77, 255];
  const t = (nx + ny) / 2;
  let r = mix(mix(tl[0], mid[0], Math.min(1, t / 0.58)), br[0], Math.max(0, (t - 0.58) / 0.42));
  let g = mix(mix(tl[1], mid[1], Math.min(1, t / 0.58)), br[1], Math.max(0, (t - 0.58) / 0.42));
  let b = mix(mix(tl[2], mid[2], Math.min(1, t / 0.58)), br[2], Math.max(0, (t - 0.58) / 0.42));

  const highlightX = width * 0.34;
  const highlightY = height * 0.20;
  const hx = (x - highlightX) / (width * 0.42);
  const hy = (y - highlightY) / (height * 0.24);
  const glow = Math.exp(-(hx * hx + hy * hy) * 2.6) * 0.2;
  r = mix(r, 255, glow);
  g = mix(g, 255, glow);
  b = mix(b, 255, glow);

  const centers = [0.285, 0.344, 0.402, 0.461, 0.539, 0.598, 0.656, 0.715];
  const topRatios = [0.445, 0.402, 0.348, 0.270, 0.270, 0.348, 0.402, 0.445];
  const bottomRatios = [0.555, 0.598, 0.652, 0.730, 0.730, 0.652, 0.598, 0.555];
  const opacities = [0.70, 0.78, 0.86, 0.98, 0.98, 0.86, 0.78, 0.70];
  const thicknesses = [0.011, 0.012, 0.013, 0.0155, 0.0155, 0.013, 0.012, 0.011];
  const edge = width * 0.014;

  for (let i = 0; i < centers.length; i += 1) {
    const cx = width * centers[i];
    const line = smoothstep(width * thicknesses[i] + edge, width * thicknesses[i], Math.abs(x - cx));
    const vertical = y >= height * topRatios[i] && y <= height * bottomRatios[i] ? 1 : 0;
    const alpha = line * vertical * opacities[i];
    if (alpha > 0) {
      r = mix(r, 255, alpha);
      g = mix(g, 255, alpha);
      b = mix(b, 255, alpha);
    }
  }

  return [Math.round(r), Math.round(g), Math.round(b), 255];
}

mkdirSync(publicDir, { recursive: true });
writeFileSync(path.join(publicDir, 'icon-bold.png'), makePng(512, 512, paintIcon));
console.log('Generated icon-bold.png');
