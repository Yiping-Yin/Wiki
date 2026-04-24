#!/usr/bin/env node
/**
 * Capture App Store submission screenshots at the required Mac size.
 *
 * Apple currently accepts Mac screenshots at 1280x800, 1440x900,
 * 2560x1600, or 2880x1800. PNG and JPEG are accepted, one to ten
 * screenshots per localization. We use JPEG at 2880x1800 by default
 * so the paper texture stays well under App Store upload limits.
 *
 * We capture 5 hero surfaces: one focused screenshot each, not the
 * full 31-surface audit. Outputs images to .app-store/screenshots/,
 * which is gitignored and also excluded from the Next.js build.
 */
import { chromium } from '@playwright/test';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
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
const FORMAT = (process.env.LOOM_SCREENSHOT_FORMAT ?? 'jpeg').toLowerCase();
const QUALITY = Number(process.env.LOOM_SCREENSHOT_QUALITY ?? 86);
const EXTENSION = FORMAT === 'jpeg' ? 'jpg' : FORMAT;

if (FORMAT !== 'jpeg' && FORMAT !== 'png') {
  throw new Error(`LOOM_SCREENSHOT_FORMAT must be "jpeg" or "png", got "${FORMAT}"`);
}

// Hero surfaces: one screenshot each, no dark variant, no responsive
// breakpoint. Apple reviewers glance at these; showcase the product soul.
const SHOTS = [
  { slug: '01-library',    url: '/desk',         caption: 'Your library, as a bookshelf.' },
  { slug: '02-home',       url: '/',             caption: 'A room for slow reading.' },
  { slug: '03-draft',      url: '/soan',         caption: 'Cards become a thinking draft.' },
  { slug: '04-patterns',   url: '/patterns',     caption: 'Thoughts that return settle here.' },
  { slug: '05-frontispiece', url: '/frontispiece', caption: 'A book, not a dashboard.' },
];

// Size cap so we know early if a shot ballooned. 2880x1800 JPEG captures
// of Loom's textured paper should stay comfortably under this.
const MAX_BYTES = Number(process.env.LOOM_SCREENSHOT_MAX_BYTES ?? 1_500_000);
const MIN_BYTES = Number(process.env.LOOM_SCREENSHOT_MIN_BYTES ?? 120_000);

const SCREENSHOT_CSS = `
  nextjs-portal,
  [data-nextjs-toast],
  [data-nextjs-dialog-overlay],
  [data-nextjs-dev-tools-button] {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }

  html[data-loom-screenshot] .layout main {
    animation: none !important;
    opacity: 1 !important;
  }

  *,
  *::before,
  *::after {
    transition-duration: 0s !important;
    transition-delay: 0s !important;
  }
`;

async function scrubRuntimeChrome(page) {
  await page.addStyleTag({ content: SCREENSHOT_CSS });
  await page.evaluate(() => {
    if (document.documentElement) {
      document.documentElement.dataset.loomScreenshot = '1';
    }
    try {
      sessionStorage.setItem('loom:ai-key-banner-dismissed', '1');
    } catch {}
    for (const el of document.querySelectorAll('[role="status"]')) {
      if (el instanceof HTMLElement && el.textContent?.includes('Anthropic API key')) {
        el.style.display = 'none';
        el.style.visibility = 'hidden';
        el.setAttribute('aria-hidden', 'true');
      }
    }
    for (const el of document.querySelectorAll('nextjs-portal')) {
      if (el instanceof HTMLElement) {
        el.style.display = 'none';
        el.style.visibility = 'hidden';
        el.setAttribute('aria-hidden', 'true');
      }
    }
  });
}

async function clearPreviousScreenshots() {
  const entries = await readdir(OUT_DIR, { withFileTypes: true }).catch((err) => {
    if (err?.code === 'ENOENT') return [];
    throw err;
  });
  await Promise.all(entries
    .filter((entry) => entry.isFile() && /\.(?:png|jpe?g)$/i.test(entry.name))
    .map((entry) => rm(path.join(OUT_DIR, entry.name), { force: true })));
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await clearPreviousScreenshots();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    colorScheme: 'light',
    deviceScaleFactor: SCALE,
  });
  await ctx.addInitScript(() => {
    try {
      sessionStorage.setItem('loom:ai-key-banner-dismissed', '1');
    } catch {}
    if (document.documentElement) {
      document.documentElement.dataset.loomScreenshot = '1';
    }
  });
  const page = await ctx.newPage();

  for (const { slug, url, caption } of SHOTS) {
    const target = `${BASE}${url}`;
    const file = path.join(OUT_DIR, `${slug}.${EXTENSION}`);
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
    await scrubRuntimeChrome(page);
    await page.waitForTimeout(1000);
    await scrubRuntimeChrome(page);
    const options = {
      path: file,
      fullPage: false,
      type: FORMAT,
      omitBackground: false,
    };
    if (FORMAT === 'jpeg') options.quality = QUALITY;
    await page.screenshot(options);
    const st = await stat(file);
    const kb = Math.round(st.size / 1024);
    if (st.size < MIN_BYTES) {
      throw new Error(`${slug} appears blank or under-rendered: ${st.size} bytes < ${MIN_BYTES}`);
    }
    if (st.size > MAX_BYTES) {
      throw new Error(`${slug} is oversized: ${st.size} bytes > ${MAX_BYTES}`);
    }
    console.log(`ok ${slug.padEnd(14)} ${String(kb).padStart(4)} KB  ${caption}`);
  }

  await ctx.close();
  await browser.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
