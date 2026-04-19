/**
 * Ingest the user's READ-ONLY personal knowledge base from the configured
 * knowledge root (`LOOM_KNOWLEDGE_ROOT`, or a sensible local default)
 * into a SCALABLE manifest + per-doc JSON files served by dynamic routes.
 *
 * Source files are NEVER modified. We only READ them.
 *
 * Outputs (all inside the runtime cache):
 *   - knowledge/.cache/manifest/knowledge-nav.json
 *   - knowledge/.cache/manifest/knowledge-manifest.json
 *   - knowledge/.cache/docs/<id>.json
 *
 * Architecture:
 *   - Skip claude-code-source-main, node_modules, hidden, temp files
 *   - PDFs / binaries are ALWAYS the canonical doc — sourcePath points to the original
 *   - Sidecar `*.pdf.txt` (or `*.csv.txt`, etc.) is consumed only as extracted body for
 *     search/preview/RAG, never registered as its own doc
 *   - Top-level category = first meaningful directory (e.g. UNSW/MATH 3856 → "UNSW · MATH 3856")
 *   - Dedup by category+slug
 */
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { KNOWLEDGE_ROOT, toKnowledgeRelativePath } from '../lib/server-config';
import { knowledgeDocRuntimeDir, knowledgeDocRuntimePath } from '../lib/knowledge-doc-cache';
import { knowledgeManifestPath, knowledgeManifestRoot, knowledgeNavPath } from '../lib/knowledge-store';
import type { KnowledgeCategory } from '../lib/knowledge-types';

const SRC = KNOWLEDGE_ROOT;
const DOCS_DIR = knowledgeDocRuntimeDir();

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.cache']);
const SKIP_PREFIXES = ['~$', '.DS', '._'];

type DocMeta = {
  id: string;            // unique slug "category-slug__file-slug"
  title: string;
  category: string;
  categorySlug: string;
  /** Sub-section within a category — e.g. "Week 3", "Course material - Lectures".
   *  Empty string if the file sits directly under the category root. */
  subcategory: string;
  /** Numeric sort key derived from subcategory (week number, lecture #, …) */
  subOrder: number;
  fileSlug: string;
  sourcePath: string;    // relative to KNOWLEDGE_ROOT, READ-ONLY
  ext: string;
  size: number;
  hasText: boolean;
  preview: string;       // first ~200 chars
};

/** Extract a numeric ordering from labels like "Week 3", "Week 01", "Week 1&2", "Lecture 7". */
function subOrder(label: string): number {
  if (!label) return 9999;
  const m = label.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 9999;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\+/g, '-plus')  // C++ → c-plus-plus
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'doc';
}

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    if (SKIP_PREFIXES.some((p) => e.name.startsWith(p))) continue;
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

/** UNSW course code pattern, e.g. "FINS 3646", "INFS2822", "MATH 1141". */
const COURSE_CODE_RE = /^[A-Z]{2,4}\s*\d{3,4}$/i;

function categorizePath(absPath: string): {
  category: string; categorySlug: string;
  subcategory: string;
} {
  const rel = path.relative(SRC, absPath);
  const parts = rel.split(path.sep);
  // parts: [top, ...mid, filename]
  const dirParts = parts.slice(0, -1);
  if (dirParts.length === 0) return { category: 'Misc', categorySlug: 'misc', subcategory: '' };

  // UNSW/<course>/<sub...>/<file>
  //
  // Some documents are misfiled under the wrong course, e.g.
  //   UNSW/FINS 3646/INFS 2822/w2 infs2822.pdf
  // The deepest directory that matches a course-code pattern is the real owner,
  // so we walk dirParts and pick the LAST course-code-shaped segment.
  if (dirParts[0] === 'UNSW' && dirParts.length >= 2) {
    let courseIdx = 1;
    for (let i = dirParts.length - 1; i >= 1; i--) {
      if (COURSE_CODE_RE.test(dirParts[i].trim())) { courseIdx = i; break; }
    }
    const course = dirParts[courseIdx];
    const sub = dirParts.slice(courseIdx + 1).join(' / ');
    return {
      category: `UNSW · ${course}`,
      categorySlug: slugify(`unsw-${course}`),
      subcategory: sub,
    };
  }

  // Generic: first dir = category, remainder = subcategory
  const top = dirParts[0];
  const sub = dirParts.slice(1).join(' / ');
  return { category: top, categorySlug: slugify(top), subcategory: sub };
}

function readableTitle(filename: string): string {
  return filename
    .replace(/\.(pdf|docx?|pptx?|xlsx?|csv|tsv|json|ipynb|parquet|txt|md|mdx)$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clean OCR/PDF-extraction text artefacts:
 *  - Drop repeated headers/footers (lines appearing > 3× across the doc)
 *  - Drop standalone page numbers
 *  - Join hyphenated word breaks at line ends ("inter-\nesting" → "interesting")
 *  - Normalize whitespace runs
 *  - Re-flow paragraphs (single newlines → space; blank lines → paragraph break)
 */
function cleanText(raw: string): string {
  if (!raw) return raw;
  // 1. Trim invisible chars
  let s = raw.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/\u200b/g, '');

  // 2. Kill TOC dot-leaders FIRST: "Section name . . . . . . . 31" → "Section name 31"
  //    These cause the entire body to look like an unreadable wall.
  s = s.replace(/(?:\s?\.){4,}\s?/g, ' ');           // ". . . . ." or "....." runs
  s = s.replace(/(?:\s?·){4,}\s?/g, ' ');            // middot leaders
  s = s.replace(/(?:\s?_){4,}\s?/g, ' ');            // underscore leaders

  // 3. Detect repeated header/footer lines (short lines appearing >3 times)
  const lineCounts = new Map<string, number>();
  for (const ln of s.split('\n')) {
    const t = ln.trim();
    if (t.length > 3 && t.length < 80) lineCounts.set(t, (lineCounts.get(t) ?? 0) + 1);
  }
  const repeated = new Set(
    Array.from(lineCounts.entries())
      .filter(([, n]) => n >= 4)
      .map(([line]) => line),
  );

  // 4. Detect TOC-like blocks (section title followed by page number)
  //    e.g. "2.8.1 Plotting Piecewise-defined Functions 31"
  //    If many of these appear consecutively, the doc is mostly a TOC and we
  //    should at least make each one its own line.
  //
  //    Drop the trailing page number from such lines but keep the title.

  // 5. Filter lines: drop standalone page numbers + repeated headers/footers + tiny noise
  const lines = s.split('\n').filter((ln) => {
    const t = ln.trim();
    if (!t) return true;
    if (/^\d{1,4}$/.test(t)) return false;
    if (/^Page \d+( of \d+)?$/i.test(t)) return false;
    if (repeated.has(t)) return false;
    // drop lines that are >50% punctuation (high noise)
    const punct = (t.match(/[\.\,\-\_·…]/g) ?? []).length;
    if (punct > 0 && punct / t.length > 0.5) return false;
    return true;
  });

  // 6. Fix hyphenated word breaks
  s = lines.join('\n').replace(/(\w)-\n\s*(\w)/g, '$1$2');

  // 6a. Preserve columnar layouts.
  //     Layout-aware PDF extraction (e.g. `pdftotext -layout`) represents
  //     multi-column slides by padding with many spaces between columns:
  //
  //       Week 1                Week 2                Week 3
  //       Python                Python                Python
  //
  //     If we blindly re-flow in step 7 and collapse whitespace in step 8,
  //     adjacent columns get concatenated into nonsense like
  //     "Week 1 Week 2 Week 3 Python Python Python".
  //
  //     Strategy: detect lines that contain 2+ runs of 4+ whitespace (column
  //     gaps). Replace each gap with " · " so the columns stay visibly split,
  //     AND wrap such lines in sentinel markers so steps 7–8 leave them alone.
  const COL_SENTINEL_OPEN = '\u0001';
  const COL_SENTINEL_CLOSE = '\u0002';
  s = s.split('\n').map((ln) => {
    if (ln.trim() === '') return ln;
    // Count runs of 4+ horizontal whitespace inside (not leading/trailing)
    const gaps = ln.trim().match(/ {4,}/g);
    if (gaps && gaps.length >= 2) {
      const cells = ln.trim().split(/ {4,}/).map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 3) {
        return COL_SENTINEL_OPEN + cells.join(' · ') + COL_SENTINEL_CLOSE;
      }
    }
    return ln;
  }).join('\n');

  // 7. Re-flow: single newline → space (but never cross a columnar row)
  s = s.replace(/([^\n\u0001\u0002])\n([^\n\u0001\u0002])/g, '$1 $2');

  // 8. Collapse blank lines + whitespace (but don't touch columnar rows)
  s = s.replace(/\n{3,}/g, '\n\n');
  s = s.split('\n').map((ln) => {
    if (ln.startsWith(COL_SENTINEL_OPEN)) {
      return ln.replace(/[\u0001\u0002]/g, '');
    }
    return ln.replace(/[ \t]{2,}/g, ' ').trim();
  }).join('\n');

  // 9. Final cleanup: stray dots from leader removal
  s = s.replace(/ \. \. \./g, '');
  s = s.replace(/ {2,}/g, ' ');

  return s.trim();
}

async function readBody(textPath: string | null, ext: string): Promise<string> {
  if (!textPath) {
    return `[Binary file · no text extracted · open the original to view]\n\nFormat: ${ext}`;
  }
  try {
    const raw = await fs.readFile(textPath, 'utf-8');
    return cleanText(raw.slice(0, 80000)).slice(0, 50000);
  } catch (e: any) {
    return `[Could not read text: ${e.message}]`;
  }
}

async function main() {
  console.log(`📁 scanning ${SRC}`);
  const all = await walk(SRC);
  console.log(`   found ${all.length} files`);

  // Index of every `.txt` sidecar so we can pair binaries with their extracted text.
  // A sidecar is any path that, after stripping its trailing `.txt`, points to an
  // existing file. e.g. `foo.pdf.txt` → sidecar of `foo.pdf`; `data.csv.txt` → `data.csv`.
  const sidecarFor = new Map<string, string>(); // canonical → sidecar
  const sidecarSet = new Set<string>();          // sidecar paths (to skip during walk)
  for (const p of all) {
    if (!p.endsWith('.txt')) continue;
    const stripped = p.slice(0, -4);
    if (stripped !== p && all.includes(stripped) && !stripped.endsWith('.txt')) {
      sidecarFor.set(stripped, p);
      sidecarSet.add(p);
    }
  }

  const docs: DocMeta[] = [];
  const docBodies = new Map<string, string>();
  const seen = new Set<string>();

  for (const p of all) {
    if (sidecarSet.has(p)) continue;                      // never register sidecar as a doc
    if (path.basename(p).startsWith('~$')) continue;
    if (p.includes('/node_modules/')) continue;
    if (p.includes('claude-code-source-main')) continue;

    const ext = path.extname(p).toLowerCase();
    const isPlainText = ['.txt', '.md', '.mdx'].includes(ext);
    const isBinary = ['.pdf', '.docx', '.doc', '.pptx', '.ppt', '.xlsx', '.xls'].includes(ext);
    const isData = ['.csv', '.tsv', '.json', '.ipynb', '.parquet'].includes(ext);
    if (!isPlainText && !isBinary && !isData) continue;

    const { category, categorySlug, subcategory } = categorizePath(p);
    const baseName = path.basename(p);
    const title = readableTitle(baseName);
    const fileSlug = slugify(title);
    const id = `${categorySlug}__${fileSlug}`;
    if (seen.has(id)) continue;
    seen.add(id);

    // Body source: the sidecar if it exists, otherwise the file itself for plain text.
    const textPath = sidecarFor.get(p) ?? (isPlainText ? p : null);
    const stat = await fs.stat(p).catch(() => null);
    const body = await readBody(textPath, ext);
    const preview = body.replace(/\s+/g, ' ').trim().slice(0, 220);

    docs.push({
      id, title, category, categorySlug,
      subcategory, subOrder: subOrder(subcategory),
      fileSlug,
      sourcePath: toKnowledgeRelativePath(p), ext: ext || '.txt',
      size: stat?.size ?? 0,
      hasText: !!textPath,
      preview,
    });
    docBodies.set(id, body);
  }

  console.log(`📦 ${docs.length} unique docs across ${new Set(docs.map((d) => d.categorySlug)).size} categories`);

  // Write manifest
  await fs.mkdir(knowledgeManifestRoot(), { recursive: true });
  await fs.writeFile(knowledgeManifestPath(), JSON.stringify(docs, null, 0));
  console.log(`✅ wrote ${knowledgeManifestPath()}`);

  // Write per-doc body files
  if (existsSync(DOCS_DIR)) await fs.rm(DOCS_DIR, { recursive: true, force: true });
  await fs.mkdir(DOCS_DIR, { recursive: true });
  let n = 0;
  for (const d of docs) {
    const body = docBodies.get(d.id) ?? '';
    await fs.writeFile(
      knowledgeDocRuntimePath(d.id),
      JSON.stringify({ id: d.id, title: d.title, body }),
    );
    n++;
    if (n % 50 === 0) process.stdout.write(`  bodies ${n}/${docs.length}\r`);
  }
  console.log(`\n✅ wrote ${n} body files to ${DOCS_DIR}`);

  // Build category list with sub-tree
  type Sub = { label: string; order: number; count: number };
  type Cat = KnowledgeCategory;
  const catMap = new Map<string, Cat>();
  for (const d of docs) {
    let c = catMap.get(d.categorySlug);
    if (!c) {
      c = { slug: d.categorySlug, label: d.category, count: 0, subs: [], kind: 'source' };
      catMap.set(d.categorySlug, c);
    }
    c.count++;
    const subLabel = d.subcategory ?? '';
    let s = c.subs.find((x) => x.label === subLabel);
    if (!s) {
      s = { label: subLabel, order: d.subOrder, count: 0 };
      c.subs.push(s);
    }
    s.count++;
  }
  for (const c of catMap.values()) {
    c.subs.sort((a, b) => (a.order - b.order) || a.label.localeCompare(b.label));
  }
  const cats = Array.from(catMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  await fs.writeFile(
    knowledgeNavPath(),
    JSON.stringify({ knowledgeCategories: cats, knowledgeTotal: docs.length }, null, 2),
    'utf-8',
  );
  console.log(`✅ wrote ${knowledgeNavPath()} (${cats.length} categories, ${docs.length} docs)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
