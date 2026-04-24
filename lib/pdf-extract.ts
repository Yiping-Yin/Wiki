/**
 * PDF text extraction using pdfjs-dist (pure JS, no system binary needed).
 *
 * Replaces the earlier pdftotext shell-out. Advantages:
 *  - No Homebrew / poppler dependency → ships cleanly inside the Node runtime
 *    that Loom bundles, so DMG distribution just works.
 *  - Line reconstruction from text item Y-coordinates gives us readable output
 *    similar to `pdftotext -layout`, which our heuristic extractors rely on.
 */
import { promises as fs } from 'node:fs';

type TextItem = {
  str: string;
  transform: number[];
};

let pdfjsPromise: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | null = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  }
  return pdfjsPromise;
}

export type ExtractOptions = {
  /** Maximum number of pages to read (pdfjs loads lazily; this caps work). */
  lastPage?: number;
  /** Maximum characters to return after reconstruction. */
  maxChars?: number;
};

/** Read a PDF file from disk and return text reconstructed into lines. */
export async function extractPdfText(
  absPath: string,
  opts: ExtractOptions = {},
): Promise<string> {
  const { lastPage, maxChars = 6000 } = opts;
  let data: Uint8Array;
  try {
    data = new Uint8Array(await fs.readFile(absPath));
  } catch {
    return '';
  }
  try {
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
    try {
      const totalPages = doc.numPages;
      const upTo = Math.min(lastPage ?? totalPages, totalPages);
      const pageTexts: string[] = [];
      for (let p = 1; p <= upTo; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        pageTexts.push(reconstructLines(content.items as TextItem[]));
        if (pageTexts.join('\n').length >= maxChars) break;
      }
      const full = pageTexts.join('\n\n');
      return full.slice(0, maxChars);
    } finally {
      await doc.destroy();
    }
  } catch {
    return '';
  }
}

/** Group pdfjs text items by Y coordinate (one line per unique Y) and return
 *  a newline-joined string. Glyph fragments on the same line reassemble into
 *  words because we join without spaces, then collapse whitespace. */
function reconstructLines(items: TextItem[]): string {
  const byY = new Map<number, TextItem[]>();
  for (const item of items) {
    if (!item?.str) continue;
    // transform[5] is ty (Y position). Round to collapse near-equal rows.
    const y = Math.round(item.transform[5]);
    const arr = byY.get(y);
    if (arr) arr.push(item);
    else byY.set(y, [item]);
  }
  const sortedY = [...byY.entries()].sort((a, b) => b[0] - a[0]);
  const lines: string[] = [];
  for (const [, row] of sortedY) {
    row.sort((a, b) => a.transform[4] - b.transform[4]);
    let text = '';
    let prevEndX = -Infinity;
    for (const item of row) {
      const startX = item.transform[4];
      // If there's a visible X gap between items, insert a space so split
      // glyph fragments still read as separate words.
      if (prevEndX > -Infinity && startX - prevEndX > 1) text += ' ';
      text += item.str;
      prevEndX = startX + (item.str?.length ?? 0);
    }
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (cleaned) lines.push(cleaned);
  }
  return lines.join('\n');
}
