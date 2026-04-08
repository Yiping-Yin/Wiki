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
 *   - Prefer .pdf.txt (already-extracted text) over .pdf
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
  fileSlug: string;
  sourcePath: string;    // absolute, READ-ONLY
  ext: string;
  size: number;
  hasText: boolean;
  preview: string;       // first ~200 chars
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
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

function categorizePath(absPath: string): { category: string; categorySlug: string } {
  const rel = path.relative(SRC, absPath);
  const parts = rel.split(path.sep);
  if (parts[0] === 'UNSW' && parts.length >= 2) {
    return { category: `UNSW · ${parts[1]}`, categorySlug: slugify(`unsw-${parts[1]}`) };
  }
  if (parts.length === 1) return { category: 'Misc', categorySlug: 'misc' };
  return { category: parts[0], categorySlug: slugify(parts[0]) };
}

function readableTitle(filename: string): string {
  return filename
    .replace(/\.pdf\.txt$/i, '')
    .replace(/\.(pdf|docx?|pptx?|txt|md|mdx)$/i, '')
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

  const txtSet = new Set(all.filter((p) => p.endsWith('.pdf.txt')));
  const docs: DocMeta[] = [];
  const docBodies = new Map<string, string>();
  const seen = new Set<string>();

  for (const p of all) {
    if (p.endsWith('.pdf') && txtSet.has(p + '.txt')) continue;
    if (path.basename(p).startsWith('~$')) continue;
    if (p.includes('/node_modules/')) continue;
    if (p.includes('claude-code-source-main')) continue; // user's source code, not knowledge

    const ext = path.extname(p).toLowerCase();
    const isText = p.endsWith('.pdf.txt') || ['.txt', '.md', '.mdx'].includes(ext);
    const isBinary = ['.pdf', '.docx', '.doc', '.pptx', '.ppt'].includes(ext);
    if (!isText && !isBinary) continue;

    const { category, categorySlug } = categorizePath(p);
    const baseName = path.basename(p);
    const title = readableTitle(baseName);
    const fileSlug = slugify(title);
    const id = `${categorySlug}__${fileSlug}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const textPath = p.endsWith('.pdf.txt') ? p : (existsSync(p + '.txt') ? p + '.txt' : (isText ? p : null));
    const stat = await fs.stat(p).catch(() => null);
    const body = await readBody(textPath, ext);
    const preview = body.replace(/\s+/g, ' ').trim().slice(0, 220);

    docs.push({
      id, title, category, categorySlug, fileSlug,
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

  // Build category list
  const catMap = new Map<string, { slug: string; label: string; count: number }>();
  for (const d of docs) {
    if (!catMap.has(d.categorySlug)) catMap.set(d.categorySlug, { slug: d.categorySlug, label: d.category, count: 0 });
    catMap.get(d.categorySlug)!.count++;
  }
  const cats = Array.from(catMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  const navContent = `// AUTO-GENERATED by scripts/ingest-knowledge.ts
export type KnowledgeCategory = { slug: string; label: string; count: number };
export const knowledgeCategories: KnowledgeCategory[] = ${JSON.stringify(cats, null, 2)};
export const knowledgeTotal = ${docs.length};
`;
  await fs.writeFile(NAV_FILE, navContent, 'utf-8');
  console.log(`✅ wrote ${NAV_FILE} (${cats.length} categories, ${docs.length} docs)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
