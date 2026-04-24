#!/usr/bin/env node
/**
 * Capture App Store submission screenshots at the required Mac size.
 *
 * Apple currently accepts Mac screenshots at 1280x800, 1440x900,
 * 2560x1600, or 2880x1800. PNG and JPEG are accepted, one to ten
 * screenshots per localization. We use PNG at 2880x1800 by default.
 *
 * We capture 5 hero surfaces: one focused screenshot each, not the
 * full 31-surface audit. Outputs PNGs to .app-store/screenshots/, which
 * is gitignored and also excluded from the Next.js build.
 */
import { chromium } from '@playwright/test';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = path.resolve(process.env.LOOM_SCREENSHOT_DIR ?? '.app-store/screenshots');
const BASE = process.env.LOOM_SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:3000';

// Output size Apple wants (2880x1800 or 2560x1600). We render at 1/2 the
// CSS pixel size with deviceScaleFactor:2 so the layout fills the frame
// the way it does on a real Retina display — otherwise a 2880x1800
// viewport with dsf:1 gives Loom's --w-prose (~576px) content a tiny
// island in an ocean of blank paper, and the grain texture blows up the
// /home PNG past 3 MB for no visual benefit.
const OUT_WIDTH = Number(process.env.LOOM_SCREENSHOT_WIDTH ?? 2880);
const OUT_HEIGHT = Number(process.env.LOOM_SCREENSHOT_HEIGHT ?? 1800);
const SCALE = Number(process.env.LOOM_SCREENSHOT_SCALE ?? 2);
const WIDTH = Math.round(OUT_WIDTH / SCALE);
const HEIGHT = Math.round(OUT_HEIGHT / SCALE);

// Hero surfaces: one screenshot each, no dark variant, no responsive
// breakpoint. Apple reviewers glance at these; showcase the product soul.
const SHOTS = [
  { slug: '01-home',      url: '/',                caption: 'A room for slow reading.' },
  { slug: '02-library',   url: '/desk',            caption: 'Your library, as a bookshelf.' },
  { slug: '03-knowledge', url: '/knowledge',       caption: 'Sources grouped, not filed.' },
  { slug: '04-category',  url: '/knowledge/docs',  caption: 'Hold a collection. Find by feel.' },
  { slug: '05-frontis',   url: '/frontispiece',    caption: 'A book, not a dashboard.' },
];

// Size cap so we know early if a shot ballooned. 2880x1800 PNG of
// Loom's minimal typography should be well under this.
const MAX_BYTES = 2_500_000; // 2.5 MB per shot

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    colorScheme: 'light',
    deviceScaleFactor: SCALE,
  });
  const page = await ctx.newPage();

  for (const { slug, url, caption } of SHOTS) {
    const target = `${BASE}${url}`;
    const file = path.join(OUT_DIR, `${slug}.png`);
    try {
      const response = await page.goto(target, { waitUntil: 'networkidle', timeout: 25_000 });
      if (!response || !response.ok()) {
        throw new Error(`HTTP ${response?.status() ?? 'unknown'} for ${target}`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn(`! ${slug} goto failed: ${message}`);
      throw e;
    }
    await page.waitForTimeout(2500);
    await page.screenshot({
      path: file,
      fullPage: false,
      type: 'png',
      omitBackground: false,
    });
    const st = await stat(file);
    const kb = Math.round(st.size / 1024);
    const flag = st.size > MAX_BYTES ? '  oversized' : '';
    console.log(`ok ${slug.padEnd(14)} ${String(kb).padStart(4)} KB  ${caption}${flag}`);
  }

  await ctx.close();
  await browser.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
