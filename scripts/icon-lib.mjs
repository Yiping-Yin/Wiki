import { deflateSync } from 'node:zlib';

export function crc32(buffer) {
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

export function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

export function makePng(width, height, paint) {
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

export function makeIco(pngBuffer, size) {
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

export function mix(a, b, t) {
  return a + (b - a) * t;
}

export function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby || 1;
  const t = clamp01((apx * abx + apy * aby) / ab2);
  const qx = ax + abx * t;
  const qy = ay + aby * t;
  const dx = px - qx;
  const dy = py - qy;
  return Math.sqrt(dx * dx + dy * dy);
}

function roundedRectSdf(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

function lineAlpha(distance, radius, edge) {
  return 1 - smoothstep(radius, radius + edge, distance);
}

function overlay(base, value, alpha) {
  return mix(base, value, alpha);
}

export function createLoomBlueprintPainter({ bold = false, preview = false } = {}) {
  return function paintIcon(x, y, width, height) {
    const nx = x / (width - 1);
    const ny = y / (height - 1);
    const radius = width * 0.21;

    const left = x;
    const right = width - 1 - x;
    const top = y;
    const bottom = height - 1 - y;
    const dx = Math.max(radius - left, 0, radius - right, 0);
    const dy = Math.max(radius - top, 0, radius - bottom, 0);
    if (dx > 0 && dy > 0 && dx * dx + dy * dy > radius * radius) return [0, 0, 0, 0];

    const tl = preview ? [20, 28, 66] : [16, 20, 48];
    const mid = preview ? [72, 112, 232] : [54, 86, 198];
    const br = preview ? [168, 132, 255] : [142, 114, 244];
    const t = nx * 0.56 + ny * 0.44;
    let r = mix(mix(tl[0], mid[0], Math.min(1, t / 0.54)), br[0], Math.max(0, (t - 0.54) / 0.46));
    let g = mix(mix(tl[1], mid[1], Math.min(1, t / 0.54)), br[1], Math.max(0, (t - 0.54) / 0.46));
    let b = mix(mix(tl[2], mid[2], Math.min(1, t / 0.54)), br[2], Math.max(0, (t - 0.54) / 0.46));

    const topGlow = Math.exp(-((((x - width * 0.28) / (width * 0.42)) ** 2) + (((y - height * 0.16) / (height * 0.2)) ** 2)) * 2.5) * (preview ? 0.14 : 0.1);
    const bottomGlow = Math.exp(-((((x - width * 0.78) / (width * 0.36)) ** 2) + (((y - height * 0.84) / (height * 0.26)) ** 2)) * 2.2) * (preview ? 0.08 : 0.05);
    const coolGlow = Math.exp(-((((x - width * 0.74) / (width * 0.28)) ** 2) + (((y - height * 0.28) / (height * 0.24)) ** 2)) * 2.8) * (preview ? 0.05 : 0.03);
    r = overlay(r, 255, topGlow * 0.62);
    g = overlay(g, 255, topGlow * 0.66);
    b = overlay(b, 255, topGlow * 0.72);
    r = overlay(r, 168, bottomGlow * 0.85);
    g = overlay(g, 150, bottomGlow * 0.55);
    b = overlay(b, 255, bottomGlow * 0.92);
    r = overlay(r, 170, coolGlow * 0.32);
    g = overlay(g, 214, coolGlow * 0.44);
    b = overlay(b, 255, coolGlow * 0.78);

    const edgeDist = Math.min(nx, ny, 1 - nx, 1 - ny);
    const rim = 1 - smoothstep(0.02, 0.11, edgeDist);
    r = overlay(r, 255, rim * 0.12);
    g = overlay(g, 255, rim * 0.14);
    b = overlay(b, 255, rim * 0.18);

    const vignette = Math.pow(Math.max(Math.abs(nx - 0.5), Math.abs(ny - 0.5)) * 1.92, 1.4);
    const darken = clamp01(vignette);
    r *= 1 - darken * 0.18;
    g *= 1 - darken * 0.18;
    b *= 1 - darken * 0.16;

    const panelCx = width * 0.5;
    const panelCy = height * 0.52;
    const panelHw = width * 0.332;
    const panelHh = height * 0.156;
    const panelRadius = width * 0.096;
    const panelSdf = roundedRectSdf(x, y, panelCx, panelCy, panelHw, panelHh, panelRadius);
    const panelFill = clamp01(1 - smoothstep(0, width * 0.011, panelSdf)) * (preview ? 0.05 : 0.035);
    const panelBorder = lineAlpha(Math.abs(panelSdf), width * 0.0024, width * 0.0046) * (preview ? 0.14 : 0.1);
    const panelGloss = panelFill * Math.exp(-(((y - height * 0.39) / (height * 0.065)) ** 2)) * 0.42;
    const panelTint = panelFill * Math.exp(-((((x - width * 0.72) / (width * 0.34)) ** 2) + (((y - height * 0.62) / (height * 0.16)) ** 2)) * 2.2);
    const panelCaustic = panelFill * Math.exp(-((((x - width * 0.34) / (width * 0.22)) ** 2) + (((y - height * 0.4) / (height * 0.14)) ** 2)) * 3.2);
    r = overlay(r, 238, panelFill * 0.1 + panelGloss * 0.07);
    g = overlay(g, 245, panelFill * 0.12 + panelGloss * 0.08);
    b = overlay(b, 255, panelFill * 0.18 + panelGloss * 0.12);
    r = overlay(r, 168, panelTint * 0.03);
    g = overlay(g, 184, panelTint * 0.04);
    b = overlay(b, 255, panelTint * 0.07);
    r = overlay(r, 214, panelCaustic * 0.02);
    g = overlay(g, 240, panelCaustic * 0.03);
    b = overlay(b, 255, panelCaustic * 0.05);
    r = overlay(r, 255, panelBorder * 0.16);
    g = overlay(g, 255, panelBorder * 0.18);
    b = overlay(b, 255, panelBorder * 0.22);

    const markWidth = width * (preview ? 0.87 : 0.85);
    const markHeight = markWidth / 5.9;
    const scaleX = markWidth / 590;
    const scaleY = markHeight / 100;
    const markShiftX = width * 0.018;
    const offsetX = (width - markWidth) / 2 + markShiftX;
    const offsetY = (height - markHeight) / 2;
    const edge = Math.max(0.4, width * 0.0015);

    const sx = (value) => offsetX + value * scaleX;
    const sy = (value) => offsetY + value * scaleY;
    const strokeHalf = (bold ? 14.2 : 12.8) * scaleX * 0.5;
    const coreHalf = strokeHalf * 0.5;
    const auraHalf = strokeHalf * 1.2;
    const guideHalf = 0.9 * scaleX;
    const markColor = preview ? 250 : 242;
    const eyeRadius = 36 * scaleX;

    const lSegments = [
      [sx(-26), sy(0), sx(-26), sy(100)],
      [sx(-26), sy(100), sx(76), sy(100)],
    ];
    const mSegments = [
      [sx(508), sy(100), sx(508), sy(0)],
      [sx(508), sy(0), sx(549), sy(70)],
      [sx(549), sy(70), sx(590), sy(0)],
      [sx(590), sy(0), sx(590), sy(100)],
    ];

    let glyphAlpha = 0;
    let glyphShadow = 0;
    for (const [x1, y1, x2, y2] of lSegments) {
      glyphAlpha = Math.max(glyphAlpha, lineAlpha(distanceToSegment(x, y, x1, y1, x2, y2), strokeHalf, edge));
      glyphShadow = Math.max(glyphShadow, lineAlpha(distanceToSegment(x, y, x1, y1, x2, y2), strokeHalf * 1.4, edge * 4));
    }
    for (const [x1, y1, x2, y2] of mSegments) {
      glyphAlpha = Math.max(glyphAlpha, lineAlpha(distanceToSegment(x, y, x1, y1, x2, y2), strokeHalf, edge));
      glyphShadow = Math.max(glyphShadow, lineAlpha(distanceToSegment(x, y, x1, y1, x2, y2), strokeHalf * 1.4, edge * 4));
    }

    const leftEyeDistance = Math.abs(Math.hypot(x - sx(220), y - sy(50)) - eyeRadius);
    const rightEyeDistance = Math.abs(Math.hypot(x - sx(360), y - sy(50)) - eyeRadius);
    glyphAlpha = Math.max(glyphAlpha, lineAlpha(leftEyeDistance, strokeHalf, edge));
    glyphAlpha = Math.max(glyphAlpha, lineAlpha(rightEyeDistance, strokeHalf, edge));
    glyphShadow = Math.max(glyphShadow, lineAlpha(leftEyeDistance, strokeHalf * 1.4, edge * 4));
    glyphShadow = Math.max(glyphShadow, lineAlpha(rightEyeDistance, strokeHalf * 1.4, edge * 4));
    const glyphCore = Math.max(
      lineAlpha(leftEyeDistance, coreHalf, edge * 0.5),
      lineAlpha(rightEyeDistance, coreHalf, edge * 0.5),
    );

    const pupilRadius = 3.5 * scaleX;
    const pupilAlpha = Math.max(
      lineAlpha(Math.hypot(x - sx(220), y - sy(50)), pupilRadius, edge),
      lineAlpha(Math.hypot(x - sx(360), y - sy(50)), pupilRadius, edge),
    );

    const guideAlpha = lineAlpha(
      distanceToSegment(x, y, sx(290), sy(0), sx(290), sy(100)),
      guideHalf,
      edge,
    ) * (preview ? 0.032 : 0.024);

    r = overlay(r, 255, guideAlpha);
    g = overlay(g, 255, guideAlpha);
    b = overlay(b, 255, guideAlpha);

    r = overlay(r, 8, glyphShadow * 0.16);
    g = overlay(g, 10, glyphShadow * 0.16);
    b = overlay(b, 14, glyphShadow * 0.12);

    const aura = lineAlpha(Math.min(leftEyeDistance, rightEyeDistance), auraHalf, edge * 3) * 0.012;
    r = overlay(r, 188, aura * 0.16);
    g = overlay(g, 214, aura * 0.18);
    b = overlay(b, 255, aura * 0.26);
    r = overlay(r, markColor, glyphAlpha * 0.94);
    g = overlay(g, markColor, glyphAlpha * 0.96);
    b = overlay(b, 255, glyphAlpha * 0.98);
    r = overlay(r, 255, glyphCore * 0.66);
    g = overlay(g, 255, glyphCore * 0.68);
    b = overlay(b, 255, glyphCore * 0.7);

    r = overlay(r, 255, pupilAlpha * 0.94);
    g = overlay(g, 255, pupilAlpha * 0.94);
    b = overlay(b, 255, pupilAlpha * 0.96);

    return [Math.round(r), Math.round(g), Math.round(b), 255];
  };
}
