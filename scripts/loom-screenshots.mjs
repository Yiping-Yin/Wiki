#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = path.resolve('.playwright-cli/audit-2026-04-24');
const BASE = 'http://127.0.0.1:3000';

const SURFACES = [
  { slug: 'home',            url: '/' },
  { slug: 'knowledge',       url: '/knowledge' },
  { slug: 'atlas',           url: '/atlas' },
  { slug: 'today',           url: '/today' },
  { slug: 'knowledge-docs',  url: '/knowledge/docs' },
  { slug: 'desk',            url: '/desk' },
  { slug: 'highlights',      url: '/highlights' },
  { slug: 'patterns',        url: '/patterns' },
  { slug: 'coworks',         url: '/coworks' },
  { slug: 'notes',           url: '/notes' },
  { slug: 'graph',           url: '/graph' },
  { slug: 'help',            url: '/help' },
  { slug: 'colophon',        url: '/colophon' },
  { slug: 'frontispiece',    url: '/frontispiece' },
  { slug: 'atelier',         url: '/atelier' },
  { slug: 'branching',       url: '/branching' },
  { slug: 'constellation',   url: '/constellation' },
  { slug: 'cover',           url: '/cover' },
  { slug: 'contents',        url: '/contents' },
  { slug: 'kesi',            url: '/kesi' },
  { slug: 'letter',          url: '/letter' },
  { slug: 'palimpsest',      url: '/palimpsest' },
  { slug: 'panel',           url: '/panel' },
  { slug: 'pursuits',        url: '/pursuits' },
  { slug: 'quizzes',         url: '/quizzes' },
  { slug: 'salon',           url: '/salon' },
  { slug: 'soan',            url: '/soan' },
  { slug: 'uploads',         url: '/uploads' },
  { slug: 'browse',          url: '/browse' },
  { slug: 'about',           url: '/about' },
  { slug: 'onboarding',      url: '/onboarding' },
];

const VIEWPORTS = [
  { label: 'desktop-light', width: 1440, height: 900, dark: false },
  { label: 'desktop-dark',  width: 1440, height: 900, dark: true },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  for (const { label, width, height, dark } of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width, height },
      colorScheme: dark ? 'dark' : 'light',
    });
    const page = await context.newPage();
    for (const { slug, url } of SURFACES) {
      const target = `${BASE}${url}`;
      const file = path.join(OUT_DIR, `${slug}--${label}.png`);
      try {
        await page.goto(target, { waitUntil: 'networkidle', timeout: 20_000 });
      } catch (e) {
        console.warn(`! ${slug} (${label}) goto failed: ${e.message}`);
      }
      await page.waitForTimeout(2000);
      await page.screenshot({ path: file, fullPage: false });
      console.log(`✓ ${slug} (${label})`);
    }
    await context.close();
  }
  await browser.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
