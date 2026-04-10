/**
 * Ingest the user's READ-ONLY personal knowledge base from
 *   /Users/yinyiping/Desktop/Knowledge system
 * into a SCALABLE manifest + per-doc JSON files served by dynamic routes.
 *
 * Source files are NEVER modified. We only READ them.
 *
 * Outputs (all inside the Wiki project):
 *   - lib/knowledge-nav.ts                   — categories list (small, statically imported)
 *   - lib/knowledge-manifest.json            — full doc metadata (id, title, category, sourcePath, ext)
 *   - public/knowledge/docs/<id>.json        — per-doc body (lazy-loaded via fetch)
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

const SRC = '/Users/yinyiping/Desktop/Knowledge system';
const ROOT = process.cwd();
const NAV_FILE = path.join(ROOT, 'lib', 'knowledge-nav.ts');
const MANIFEST_FILE = path.join(ROOT, 'lib', 'knowledge-manifest.json');
const DOCS_DIR = path.join(ROOT, 'public', 'knowledge', 'docs');

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
  sourcePath: string;    // absolute, READ-ONLY
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
  if (dirParts[0] === 'UNSW' && dirParts.length >= 2) {
    const course = dirParts[1];
    const sub = dirParts.slice(2).join(' / ');
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

  // 7. Re-flow: single newline → space
  s = s.replace(/([^\n])\n([^\n])/g, '$1 $2');

  // 8. Collapse blank lines + whitespace
  s = s.replace(/\n{3,}/g, '\n\n');
  s = s.split('\n').map((ln) => ln.replace(/[ \t]{2,}/g, ' ').trim()).join('\n');

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
      sourcePath: p, ext: ext || '.txt',
      size: stat?.size ?? 0,
      hasText: !!textPath,
      preview,
    });
    docBodies.set(id, body);
  }

  console.log(`📦 ${docs.length} unique docs across ${new Set(docs.map((d) => d.categorySlug)).size} categories`);

  // Write manifest
  await fs.mkdir(path.dirname(MANIFEST_FILE), { recursive: true });
  await fs.writeFile(MANIFEST_FILE, JSON.stringify(docs, null, 0));
  console.log(`✅ wrote ${MANIFEST_FILE}`);

  // Write per-doc body files
  if (existsSync(DOCS_DIR)) await fs.rm(DOCS_DIR, { recursive: true, force: true });
  await fs.mkdir(DOCS_DIR, { recursive: true });
  let n = 0;
  for (const d of docs) {
    const body = docBodies.get(d.id) ?? '';
    await fs.writeFile(
      path.join(DOCS_DIR, `${d.id}.json`),
      JSON.stringify({ id: d.id, title: d.title, body }),
    );
    n++;
    if (n % 50 === 0) process.stdout.write(`  bodies ${n}/${docs.length}\r`);
  }
  console.log(`\n✅ wrote ${n} body files to ${DOCS_DIR}`);

  // Build category list with sub-tree
  type Sub = { label: string; order: number; count: number };
  type Cat = { slug: string; label: string; count: number; subs: Sub[] };
  const catMap = new Map<string, Cat>();
  for (const d of docs) {
    let c = catMap.get(d.categorySlug);
    if (!c) {
      c = { slug: d.categorySlug, label: d.category, count: 0, subs: [] };
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
  const navContent = `// AUTO-GENERATED by scripts/ingest-knowledge.ts
export type KnowledgeSub = { label: string; order: number; count: number };
export type KnowledgeCategory = { slug: string; label: string; count: number; subs: KnowledgeSub[] };
export const knowledgeCategories: KnowledgeCategory[] = ${JSON.stringify(cats, null, 2)};
export const knowledgeTotal = ${docs.length};
`;
  await fs.writeFile(NAV_FILE, navContent, 'utf-8');
  console.log(`✅ wrote ${NAV_FILE} (${cats.length} categories, ${docs.length} docs)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
