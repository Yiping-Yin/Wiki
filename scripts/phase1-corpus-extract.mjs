// Phase 1 corpus extraction helper.
// Extracts text from candidate syllabus PDFs via the existing LOOM pipeline
// (lib/pdf-extract.ts + cleanText from scripts/ingest-knowledge.ts) and writes
// fixture files to macos-app/Loom/Tests/fixtures/syllabus/.
//
// Usage:  /Users/yinyiping/Desktop/LOOM/node_modules/.bin/tsx scripts/phase1-corpus-extract.mjs
// (run from the LOOM repo root so node_modules is found).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { extractPdfText } from '/Users/yinyiping/Desktop/LOOM/lib/pdf-extract.ts';

// Duplicate of cleanText() from scripts/ingest-knowledge.ts (lines 255-347)
function cleanText(raw) {
  if (!raw) return raw;
  let s = raw.replace(/\r\n?/g, '\n').replace(/ /g, ' ').replace(/​/g, '');
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

  const COL_OPEN = '';
  const COL_CLOSE = '';
  s = s.split('\n').map((ln) => {
    if (ln.trim() === '') return ln;
    const gaps = ln.trim().match(/ {4,}/g);
    if (gaps && gaps.length >= 2) {
      const cells = ln.trim().split(/ {4,}/).map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 3) {
        return COL_OPEN + cells.join(' · ') + COL_CLOSE;
      }
    }
    return ln;
  }).join('\n');

  s = s.replace(/([^\n])\n([^\n])/g, '$1 $2');
  s = s.replace(/\n{3,}/g, '\n\n');
  s = s.split('\n').map((ln) => {
    if (ln.startsWith(COL_OPEN)) {
      return ln.replace(/[]/g, '');
    }
    return ln.replace(/[ \t]{2,}/g, ' ').trim();
  }).join('\n');

  s = s.replace(/ \. \. \./g, '');
  s = s.replace(/ {2,}/g, ' ');
  return s.trim();
}

async function getPageCount(absPath) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(await fs.readFile(absPath));
  const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  try {
    return doc.numPages;
  } finally {
    await doc.destroy();
  }
}

const FIXTURES = '/Users/yinyiping/Desktop/LOOM/macos-app/Loom/Tests/fixtures/syllabus';

const TARGETS = [
  // existing 4
  ['fins-3640', '/Users/yinyiping/Desktop/Knowledge System/UNSW/FINS 3640/Week 0/Course Overview_FINS3640.pdf', 'finance'],
  ['comm-3030', '/Users/yinyiping/Desktop/Knowledge System/UNSW/COMM 3030/COMM3030 Assessment Handbook ST, 2026.pdf', 'commerce'],
  ['infs-3822', '/Users/yinyiping/Desktop/Knowledge System/UNSW/INFS 3822/Guide/INFS3822 Assessment Guide T1 2026.pdf', 'infosys'],
  ['fins-3635', '/Users/yinyiping/Desktop/Knowledge System/UNSW/FINS 3635/Week 01/Course Overview_Derivatives_FINS3635_T12025.pdf', 'finance'],
  // new candidates (7 so we land in 5-10 range with good margin)
  ['fins-3646', '/Users/yinyiping/Desktop/Knowledge System/UNSW/FINS 3646/FINS3646/FINS3646_T1_2026 - Assessment Guide.pdf', 'finance'],
  ['fins-3666-assessment', '/Users/yinyiping/Desktop/Knowledge System/UNSW/FINS 3666/Week 01/FINS3666 Assessment Guide 2025 T1.pdf', 'finance'],
  ['math-1241', '/Users/yinyiping/Desktop/Knowledge System/UNSW/MATH 1241/CO_MATH1241_1_2025_Term2_T2_Multimodal_Standard_Kensington.pdf', 'mathematics'],
  ['fins-3666-group-project', '/Users/yinyiping/Desktop/Knowledge System/UNSW/FINS 3666/Assessment 2/FINS3666 2025 T1 Assessment 2 Group Project Student Guide V2.pdf', 'finance'],
  ['fins-3666-activity-1', '/Users/yinyiping/Desktop/Knowledge System/UNSW/FINS 3666/A1 Activity 1/FINS3666 2025 T1 Assessment 1 Activity 1 Student Guide.pdf', 'finance'],
  ['infs-3822-rubrics', '/Users/yinyiping/Desktop/Knowledge System/UNSW/INFS 3822/Guide/INFS3822 Updated Marking Rubrics T1 2026.pdf', 'infosys'],
  ['fins-3616-assessment', '/Users/yinyiping/Desktop/Knowledge System/UNSW/FINS 3616/Week 01/FINS3616 Assessement_T2_2025.pdf', 'finance'],
];

async function main() {
  await fs.mkdir(FIXTURES, { recursive: true });
  const results = [];
  for (const [slug, absPath, discipline] of TARGETS) {
    try {
      const stat = await fs.stat(absPath);
      const raw = await extractPdfText(absPath, { maxChars: 20000 });
      const cleaned = cleanText(raw).slice(0, 8000);
      const pageCount = await getPageCount(absPath);

      const inputPath = path.join(FIXTURES, `${slug}.input.txt`);
      const metaPath = path.join(FIXTURES, `${slug}.meta.json`);

      await fs.writeFile(inputPath, cleaned, 'utf-8');
      await fs.writeFile(metaPath, JSON.stringify({
        slug,
        sourcePath: absPath,
        discipline,
        fileSize: stat.size,
        pageCount,
        rawChars: raw.length,
        extractedLength: cleaned.length,
      }, null, 2), 'utf-8');

      results.push({ slug, discipline, fileSize: stat.size, pageCount, extractedLength: cleaned.length });
      console.log(`OK  ${slug}  pages=${pageCount}  chars=${cleaned.length}  (${discipline})`);
    } catch (e) {
      console.error(`ERR ${slug}: ${e.message}`);
      results.push({ slug, error: String(e) });
    }
  }
  console.log('\n=== summary ===');
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
