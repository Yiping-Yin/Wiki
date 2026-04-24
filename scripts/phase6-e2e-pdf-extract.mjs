#!/usr/bin/env node
// Phase 6 E2E smoke harness — PDF-to-{text,pageRanges} extractor.
//
// Mirrors macos-app/Loom/Sources/Ingest/PDFExtraction.swift:
//   1. Per-page extraction via pdfjs-dist (reading-order line reconstruction).
//   2. Concatenate pages with "\n\n".
//   3. Clip raw to 200_000 UTF-8 bytes.
//   4. Apply the full cleanText() pipeline (node-cleantext-wrapper mirrors
//      scripts/ingest-knowledge.ts which mirrors macos-app/.../CleanText.swift).
//   5. Build pageRanges by running CleanText over each page independently
//      and walking the cumulative cleaned length; separator +1 adjustment
//      matches the Swift implementation.
//
// Output: single JSON object on stdout with {text, pageRanges, pageCount}.
//
// Usage:
//   node scripts/phase6-e2e-pdf-extract.mjs <pdf-path>
//
// This is a VERIFICATION harness, not a production code path. Swift's
// PDFExtraction.extract() is the canonical Phase 6 pipeline; this script
// exists only to drive it offline for the E2E smoke.
//
// The harness accepts an optional --max-chars <int> (default 6000) to
// match the Swift `PDFExtraction.extract(url:maxChars:)` default used by
// IngestionRunner.extractPDFText().

import { promises as fs } from 'node:fs';
import path from 'node:path';

// cleanText() — duplicated from scripts/node-cleantext-wrapper.mjs so
// this file stays self-contained (and independent of future wrapper
// drift). If you change one, change both — the Swift CleanText.swift
// mirrors this exact body.
function cleanText(raw) {
  if (!raw) return raw;
  let s = raw.replace(/\r\n?/g, '\n').replace(/ /g, ' ').replace(/​/g, '');
  s = s.replace(/(?:\s?\.){4,}\s?/g, ' ');
  s = s.replace(/(?:\s?·){4,}\s?/g, ' ');
  s = s.replace(/(?:\s?_){4,}\s?/g, ' ');

  const lineCounts = new Map();
  for (const ln of s.split('\n')) {
    const t = ln.trim();
    if (t.length > 3 && t.length < 80) lineCounts.set(t, (lineCounts.get(t) ?? 0) + 1);
  }
  const repeated = new Set(
    Array.from(lineCounts.entries())
      .filter(([, n]) => n >= 4)
      .map(([line]) => line),
  );

  const lines = s.split('\n').filter((ln) => {
    const t = ln.trim();
    if (!t) return true;
    if (/^\d{1,4}$/.test(t)) return false;
    if (/^Page \d+( of \d+)?$/i.test(t)) return false;
    if (repeated.has(t)) return false;
    const punct = (t.match(/[\.\,\-\_·…]/g) ?? []).length;
    if (punct > 0 && punct / t.length > 0.5) return false;
    return true;
  });

  s = lines.join('\n').replace(/(\w)-\n\s*(\w)/g, '$1$2');

  const COL_OPEN = '';
  const COL_CLOSE = '';
  s = s.split('\n').map((ln) => {
    if (ln.trim() === '') return ln;
    const gaps = ln.trim().match(/ {4,}/g);
    if (gaps && gaps.length >= 2) {
      const cells = ln.trim().split(/ {4,}/).map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 3) return COL_OPEN + cells.join(' · ') + COL_CLOSE;
    }
    return ln;
  }).join('\n');

  s = s.replace(/([^\n])\n([^\n])/g, '$1 $2');
  s = s.replace(/\n{3,}/g, '\n\n');
  s = s.split('\n').map((ln) => {
    if (ln.startsWith(COL_OPEN)) return ln.replace(/[]/g, '');
    return ln.replace(/[ \t]{2,}/g, ' ').trim();
  }).join('\n');

  s = s.replace(/ \. \. \./g, '');
  s = s.replace(/ {2,}/g, ' ');
  return s.trim();
}

function applyCleanText(raw, maxChars) {
  const out = cleanText(raw);
  if (maxChars && out.length > maxChars) return out.slice(0, maxChars);
  return out;
}

// UTF-16 length, matching Swift `.utf16.count`. JavaScript strings are
// natively UTF-16, so `.length` is already UTF-16 code units.
function utf16Len(s) { return s.length; }

async function extractPagesPDFJS(pdfPath) {
  const mod = await import(
    path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs')
  );
  const data = new Uint8Array(await fs.readFile(pdfPath));
  const doc = await mod.getDocument({ data, verbosity: 0 }).promise;
  try {
    const pageTexts = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      // Duplicate of reconstructLines() from lib/pdf-extract.ts
      const byY = new Map();
      for (const item of content.items) {
        if (!item?.str) continue;
        const y = Math.round(item.transform[5]);
        const arr = byY.get(y);
        if (arr) arr.push(item); else byY.set(y, [item]);
      }
      const sortedY = [...byY.entries()].sort((a, b) => b[0] - a[0]);
      const lines = [];
      for (const [, row] of sortedY) {
        row.sort((a, b) => a.transform[4] - b.transform[4]);
        let text = '';
        let prevEndX = -Infinity;
        for (const item of row) {
          const startX = item.transform[4];
          if (prevEndX > -Infinity && startX - prevEndX > 1) text += ' ';
          text += item.str;
          prevEndX = startX + (item.str?.length ?? 0);
        }
        const cleaned2 = text.replace(/\s+/g, ' ').trim();
        if (cleaned2) lines.push(cleaned2);
      }
      pageTexts.push(lines.join('\n'));
    }
    return pageTexts;
  } finally {
    await doc.destroy();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const pdfPath = args.find((a) => !a.startsWith('--'));
  if (!pdfPath) {
    console.error('Usage: node scripts/phase6-e2e-pdf-extract.mjs <pdf>');
    process.exit(2);
  }
  let maxChars = 6000;
  const mcIdx = args.indexOf('--max-chars');
  if (mcIdx >= 0 && args[mcIdx + 1]) maxChars = parseInt(args[mcIdx + 1], 10);

  const pageTexts = await extractPagesPDFJS(pdfPath);
  const rawJoined = pageTexts.join('\n\n');

  // Raw-size safety cap — matches Swift PDFExtraction `rawCap = 200_000`.
  const rawCap = 200_000;
  let rawForClean = rawJoined;
  if (Buffer.byteLength(rawJoined, 'utf-8') > rawCap) {
    rawForClean = rawJoined.slice(0, rawCap);
  }

  const cleaned = applyCleanText(rawForClean, maxChars);

  // Build pageRanges — mirror Swift PDFExtraction.extract's loop.
  const cleanedLen = utf16Len(cleaned);
  const pageRanges = [];
  let cursor = 0;
  for (let i = 0; i < pageTexts.length; i++) {
    const pageCleaned = applyCleanText(pageTexts[i], maxChars);
    const length = utf16Len(pageCleaned);
    const start = Math.min(cursor, cleanedLen);
    const end = Math.min(start + length, cleanedLen);
    pageRanges.push({ page: i + 1, charStart: start, charEnd: end });
    cursor = end + 1; // separator contribution
  }

  const out = { text: cleaned, pageRanges, pageCount: pageTexts.length, rawLen: rawJoined.length };
  process.stdout.write(JSON.stringify(out));
}

main().catch((e) => {
  console.error(`phase6-e2e-pdf-extract: ${e.message}`);
  process.exit(1);
});
