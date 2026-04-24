#!/usr/bin/env node
// Node `cleanText()` reference wrapper — Phase 2 of the
// ingest-extractor-refactor plan.
//
// Exposes the exact cleanText() pipeline from
// `scripts/ingest-knowledge.ts` (lines 255–347) to Swift parity tests
// and ad-hoc CLI parity runs.
//
// Usage:
//   node scripts/node-cleantext-wrapper.mjs --file path/to/raw.txt
//       Reads raw text from file, writes cleaned text to stdout.
//
//   node scripts/node-cleantext-wrapper.mjs --pdf path/to/doc.pdf
//       Runs the full pipeline (pdfjs-dist extraction + cleanText)
//       and writes cleaned text to stdout.
//
//   node scripts/node-cleantext-wrapper.mjs --stdin
//       Reads raw text from stdin, writes cleaned text to stdout.
//
// The function body must stay byte-for-byte identical to the canonical
// cleanText() in ingest-knowledge.ts; Swift `CleanText.apply()` mirrors
// this. If the canonical version changes, update BOTH sides and
// regenerate parity golden files.

import { promises as fs } from 'node:fs';
import path from 'node:path';

function cleanText(raw) {
  if (!raw) return raw;
  // 1. Trim invisible chars
  let s = raw.replace(/\r\n?/g, '\n').replace(/ /g, ' ').replace(/​/g, '');

  // 2. Kill TOC dot-leaders FIRST
  s = s.replace(/(?:\s?\.){4,}\s?/g, ' ');
  s = s.replace(/(?:\s?·){4,}\s?/g, ' ');
  s = s.replace(/(?:\s?_){4,}\s?/g, ' ');

  // 3. Detect repeated header/footer lines
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

  // 5. Filter lines
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

  // 6. Fix hyphenated word breaks
  s = lines.join('\n').replace(/(\w)-\n\s*(\w)/g, '$1$2');

  // 6a. Preserve columnar layouts
  const COL_SENTINEL_OPEN = '';
  const COL_SENTINEL_CLOSE = '';
  s = s.split('\n').map((ln) => {
    if (ln.trim() === '') return ln;
    const gaps = ln.trim().match(/ {4,}/g);
    if (gaps && gaps.length >= 2) {
      const cells = ln.trim().split(/ {4,}/).map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 3) {
        return COL_SENTINEL_OPEN + cells.join(' · ') + COL_SENTINEL_CLOSE;
      }
    }
    return ln;
  }).join('\n');

  // 7. Reflow
  s = s.replace(/([^\n])\n([^\n])/g, '$1 $2');

  // 8. Collapse blank lines + whitespace
  s = s.replace(/\n{3,}/g, '\n\n');
  s = s.split('\n').map((ln) => {
    if (ln.startsWith(COL_SENTINEL_OPEN)) {
      return ln.replace(/[]/g, '');
    }
    return ln.replace(/[ \t]{2,}/g, ' ').trim();
  }).join('\n');

  // 9. Final cleanup
  s = s.replace(/ \. \. \./g, '');
  s = s.replace(/ {2,}/g, ' ');
  return s.trim();
}

async function readStream(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
}

async function main() {
  const args = process.argv.slice(2);
  let raw = null;
  let mode = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--file' && args[i + 1]) {
      raw = await fs.readFile(args[i + 1], 'utf-8');
      mode = 'file';
      i++;
    } else if (a === '--pdf' && args[i + 1]) {
      // Lazy-load pdfjs only when needed so the --file / --stdin
      // paths stay dependency-free and work without the repo's
      // node_modules installed.
      const pdfPath = args[i + 1];
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
          // so this wrapper is self-contained.
          const byY = new Map();
          for (const item of content.items) {
            if (!item?.str) continue;
            const y = Math.round(item.transform[5]);
            const arr = byY.get(y);
            if (arr) arr.push(item);
            else byY.set(y, [item]);
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
            const cleaned = text.replace(/\s+/g, ' ').trim();
            if (cleaned) lines.push(cleaned);
          }
          pageTexts.push(lines.join('\n'));
        }
        raw = pageTexts.join('\n\n').slice(0, 6000);
      } finally {
        await doc.destroy();
      }
      mode = 'pdf';
      i++;
    } else if (a === '--stdin') {
      raw = await readStream(process.stdin);
      mode = 'stdin';
    }
  }

  if (raw === null) {
    console.error('Usage: node scripts/node-cleantext-wrapper.mjs --file <path> | --pdf <path> | --stdin');
    process.exit(2);
  }

  const out = cleanText(raw);
  process.stdout.write(out);
}

main().catch((e) => {
  console.error(`node-cleantext-wrapper: ${e.message}`);
  process.exit(1);
});
