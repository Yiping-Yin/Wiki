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
import { KNOWLEDGE_ROOT } from '../lib/server-config';
import { knowledgeDocRuntimeDir, knowledgeDocRuntimePath } from '../lib/knowledge-doc-cache';
import {
  collectionMetadataPath,
  knowledgeManifestPath,
  knowledgeManifestRoot,
  knowledgeNavPath,
} from '../lib/knowledge-store';
import type { CollectionMetadata, FolderTopic, KnowledgeCategory } from '../lib/knowledge-types';
import { extractPdfText as extractPdfTextImpl } from '../lib/pdf-extract';

// These used to be module-level constants; now resolved per-invocation so
// the API route can call runIngest() after the user picks a new content
// root without needing to restart the server. CLI usage still works because
// the default falls through to KNOWLEDGE_ROOT from the environment.
function resolveSrc(): string {
  const override = process.env.LOOM_KNOWLEDGE_ROOT?.trim();
  return override && override.length > 0 ? override : KNOWLEDGE_ROOT;
}
function resolveDocsDir(): string {
  return knowledgeDocRuntimeDir();
}

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

function sourceRelativePath(absPath: string, SRC: string): string {
  return path.relative(SRC, absPath).split(path.sep).join('/');
}

async function walk(
  dir: string,
  out: string[] = [],
  rootAbs?: string,
  scope?: { included: string[] },
): Promise<string[]> {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return out; }
  const root = rootAbs ?? dir;
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    if (SKIP_PREFIXES.some((p) => e.name.startsWith(p))) continue;
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (scope && scope.included.length > 0) {
        const rel = path.relative(root, full).split(path.sep).join('/');
        const inScope = scope.included.some(
          (sel) => rel === sel || rel.startsWith(sel + '/') || sel.startsWith(rel + '/'),
        );
        if (!inScope) continue;
      }
      await walk(full, out, root, scope);
    } else {
      if (scope && scope.included.length > 0) {
        const rel = path.relative(root, full).split(path.sep).join('/');
        const inScope = scope.included.some(
          (sel) => rel === sel || rel.startsWith(sel + '/'),
        );
        if (!inScope) continue;
      }
      out.push(full);
    }
  }
  return out;
}

/** UNSW course code pattern, e.g. "FINS 3646", "INFS2822", "MATH 1141". */
const COURSE_CODE_RE = /^[A-Z]{2,4}\s*\d{3,4}$/i;
const COLLECTION_BUCKET_RE = /^(assessment|assessments|course\s*materials?|course\s*info|lectures?|seminars?|slides?|tutorials?|tuts?|weeks?|readings?|resources?|notes?|labs?|workshops?|textbooks?)\b/i;

function scopedCategoryLabel(parts: string[]) {
  const leaf = parts[parts.length - 1] ?? '';
  const parent = parts[parts.length - 2] ?? '';
  if (parent.toUpperCase() === 'UNSW' && COURSE_CODE_RE.test(leaf.trim())) {
    return `UNSW · ${leaf}`;
  }
  return leaf;
}

function rootCategoryLabel(SRC: string, dirParts: string[]) {
  const rootName = path.basename(SRC).trim();
  if (!rootName) return null;

  const firstDir = dirParts[0]?.trim() ?? '';
  const rootLooksLikeCourse = COURSE_CODE_RE.test(rootName);
  const firstDirLooksLikeCollectionBucket = firstDir ? COLLECTION_BUCKET_RE.test(firstDir) : true;
  if (!rootLooksLikeCourse && !firstDirLooksLikeCollectionBucket) return null;

  const parent = path.basename(path.dirname(SRC)).trim();
  if (parent.toUpperCase() === 'UNSW' && rootLooksLikeCourse) {
    return `UNSW · ${rootName}`;
  }
  return rootName;
}

function categorizePath(
  absPath: string,
  SRC: string,
  scope?: { included: string[] },
): {
  category: string; categorySlug: string;
  subcategory: string;
} {
  const rel = path.relative(SRC, absPath);
  const parts = rel.split(path.sep);
  // parts: [top, ...mid, filename]
  const dirParts = parts.slice(0, -1);

  // Scope-aware categorization: if the user picked a scope entry (e.g.
  // "UNSW/INFS3822"), that entry IS the category — not its parent and not
  // its children. Everything deeper becomes subcategory. This keeps
  // Loom's display aligned with the Finder tree the user chose as the
  // semantic unit, instead of silently flattening or silently deepening.
  if (scope && scope.included.length > 0 && dirParts.length > 0) {
    const relDir = dirParts.join('/');
    // Find the longest matching scope entry — deepest match wins so that
    // overlapping selections pick the most specific collection boundary.
    const matches = scope.included
      .filter((s) => relDir === s || relDir.startsWith(s + '/'))
      .sort((a, b) => b.length - a.length);
    const match = matches[0];
    if (match) {
      const matchParts = match.split('/');
      const categoryLabel = scopedCategoryLabel(matchParts);
      const remaining = dirParts.slice(matchParts.length);
      return {
        category: categoryLabel,
        categorySlug: slugify(categoryLabel),
        subcategory: remaining.join(' / '),
      };
    }
  }

  const rootLabel = rootCategoryLabel(SRC, dirParts);
  if (rootLabel) {
    return {
      category: rootLabel,
      categorySlug: slugify(rootLabel),
      subcategory: dirParts.join(' / '),
    };
  }

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

const SYLLABUS_HINT_RE = /(syllabus|outline|guide|handbook|course\s+info|overview|assessment\s+guide)/i;
const SLIDE_HINT_RE = /(seminar\s+slide|lecture\s+slide|lecture\s+notes?|seminar|slides?\b|week\s+\d+)/i;

/** Thin wrapper over pdfjs-dist. Empty string on failure — callers treat
 *  missing text as "no signal", not as an error. `lastPage` limits the
 *  extraction to the first N pages (slide decks put the topic on page 1). */
async function extractPdfText(
  absPath: string,
  opts: { maxChars?: number; lastPage?: number } = {},
): Promise<string> {
  return extractPdfTextImpl(absPath, opts);
}

/** Harvest teacher names from any text block. Matches "Dr FirstName [Middle] LastName"
 *  and "Prof FirstName LastName". Stops at line boundaries — the regex used to
 *  span newlines via `\s+` and snowball into the next line (e.g. "Jason Wu /
 *  School of …"). */
function harvestTeachers(text: string): string[] {
  const found = new Set<string>();
  const re = /\b(?:Dr|Prof(?:\.|essor)?)\.?[ \t]+([A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+){1,3})/g;
  for (const m of text.matchAll(re)) {
    const name = m[1].trim();
    if (!/(Support|Hub|Office|Team|Faculty|School|Business|Student)/i.test(name)) {
      found.add(name);
    }
  }
  return Array.from(found);
}

/** Extract a week/topic subtitle from the first page of a slide deck.
 *  Strategy: strip the known header lines (course code, course name, "Week N
 *  Seminar" marker) and return the first 1-2 substantive lines that look like
 *  a title — capitalized, reasonable length, not boilerplate. */
function extractFolderTopic(firstPageText: string, courseCode?: string): string | undefined {
  const lines = firstPageText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const skip = (line: string) => {
    if (courseCode) {
      const codeFlat = courseCode.replace(/\s+/g, '\\s*');
      if (new RegExp(`^${codeFlat}\\b`, 'i').test(line)) return true;
    }
    if (/^(artificial intelligence for business analytics|unsw|business school|school of|copyright|\u00a9)/i.test(line)) {
      return true;
    }
    if (/^(week|seminar|lecture)\s+\d+\s*(seminar|lecture)?$/i.test(line)) return true;
    if (/^\s*dr\b|^\s*prof\b/i.test(line)) return true;
    return false;
  };

  const meaningful: string[] = [];
  for (const line of lines) {
    if (skip(line)) continue;
    if (line.length < 4 || line.length > 120) continue;
    // Must start with a capital letter or number (a real title).
    if (!/^[A-Z0-9]/.test(line)) continue;
    meaningful.push(line);
    if (meaningful.length >= 2) break;
  }
  if (meaningful.length === 0) return undefined;
  // Slide titles sometimes wrap across 2 lines — join only if the second
  // line is a continuation (no terminal punctuation on first; second doesn't
  // start with a footnote/reference marker, URL, or colon-led label).
  const isContinuation = (tail: string) => {
    if (/^(reference|note|source|contents|available|copyright|abstract|see also)\b/i.test(tail)) {
      return false;
    }
    if (/^[A-Z][a-z]+:/.test(tail)) return false; // "Name:" style labels
    if (/https?:\/\//i.test(tail)) return false;
    if (tail.length > 70) return false; // real title continuations are short
    return true;
  };
  const joined =
    meaningful.length === 2 &&
    meaningful[0].length < 50 &&
    !/[.!?]\s*$/.test(meaningful[0]) &&
    isContinuation(meaningful[1])
      ? meaningful.join(' ')
      : meaningful[0];
  return joined.replace(/\s+/g, ' ').trim();
}

/** Heuristic metadata extraction from syllabus-like text + known category label.
 *  Conservative: leaves fields undefined when we aren't confident. User can
 *  override via the collection-overrides file. */
function extractCollectionMetadata(
  categorySlug: string,
  categoryLabel: string,
  text: string,
  sourceDocId?: string,
): CollectionMetadata {
  const meta: CollectionMetadata = { categorySlug };

  // Course code: pull from "UNSW · INFS 3822" style label
  const codeInLabel = categoryLabel.match(/\b([A-Z]{2,4})\s*(\d{3,4})\b/);
  if (codeInLabel) {
    meta.courseCode = `${codeInLabel[1]} ${codeInLabel[2]}`;
  }

  const flat = text.replace(/\s+/g, ' ').trim();

  // Term. Common shapes: "T1 2026", "T1/2026", "Term 1, 2026", "Semester 2 2025".
  const termHit =
    flat.match(/\bT[1-4]\s*[\/\-–]?\s*(?:20\d{2})\b/i) ||
    flat.match(/\bTerm\s*[1-4][,\s]+20\d{2}\b/i) ||
    flat.match(/\bSemester\s*[1-4][,\s]+20\d{2}\b/i);
  if (termHit) {
    meta.term = termHit[0]
      .replace(/\s*[\/\-–]\s*/, ' ')
      .replace(/,\s*/, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Course name. Many syllabi stack code + title across lines, so after
  // flattening whitespace the code is followed by the title words directly
  // (no separator). Accept either shape, then stop at a section boundary.
  if (meta.courseCode) {
    const codeFlat = meta.courseCode.replace(/\s+/g, '\\s*');
    const nameRe = new RegExp(
      `${codeFlat}\\s*(?:[-:–—]\\s*)?([A-Z][A-Za-z][A-Za-z0-9 &'\\-\\/]{3,80}?)\\s+(?=Term\\b|T[1-4]\\b|Semester\\b|Assessment\\b|Course\\b|Learning\\b|UNSW\\b|20\\d{2}\\b)`,
      'i',
    );
    const nameHit = flat.match(nameRe);
    if (nameHit) {
      meta.courseName = nameHit[1]
        .trim()
        .replace(/\s+\d{4}$/, '')
        // Collapse camel-runs from pdftotext multi-line flattening.
        .replace(/\s+/g, ' ')
        .trim();
    }
  }

  // Teachers. Look for explicit role labels followed by a name line.
  const teacherRoles = /(Lecturer|Instructor|Coordinator|Teaching Contact|Convenor)s?\s*:?\s*/i;
  const teacherMatches = new Set<string>();
  for (const m of text.matchAll(new RegExp(teacherRoles.source + '([^\\n]{2,80})', 'gi'))) {
    const rawName = m[2].trim();
    // Strip common trailing noise: emails, roles, separators.
    const cleaned = rawName
      .replace(/\S+@\S+/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/\(.*?\)/g, '')
      .replace(/[,\|].*$/, '')
      .replace(/\s{2,}.*$/, '')
      .trim();
    if (cleaned && /^[A-Z][\p{L}\s.'\-]{1,60}$/u.test(cleaned)) {
      teacherMatches.add(cleaned);
    }
  }
  if (teacherMatches.size > 0) {
    meta.teachers = Array.from(teacherMatches).slice(0, 4);
  }

  if (sourceDocId) meta.sourceDocId = sourceDocId;
  return meta;
}

async function main() {
  const SRC = resolveSrc();
  const DOCS_DIR = resolveDocsDir();
  // Honor user-configured scan scope (if any) — only the selected subtrees
  // are walked. Empty scope = scan everything (backward compatible).
  const { readScanScope } = await import('../lib/scan-scope');
  const scope = await readScanScope();
  if (scope.included.length > 0) {
    console.log(`📂 scope: ${scope.included.length} folder${scope.included.length === 1 ? '' : 's'} selected`);
  }
  console.log(`📁 scanning ${SRC}`);
  const all = await walk(SRC, [], SRC, scope);
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

    const { category, categorySlug, subcategory } = categorizePath(p, SRC, scope);
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
      sourcePath: sourceRelativePath(p, SRC), ext: ext || '.txt',
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

  // Collection metadata extraction: pull course name, term, teachers from a
  // syllabus-like root-level PDF per category. Deterministic today (regex on
  // pdftotext output); AI-backed extraction can layer on later. Missing
  // fields are fine — the renderer treats them as optional.
  const collectionMeta: CollectionMetadata[] = [];
  for (const cat of cats) {
    const catDocs = docs.filter((d) => d.categorySlug === cat.slug);
    const rootPdfs = catDocs.filter(
      (d) => d.ext === '.pdf' && !(d.subcategory ?? '').trim(),
    );
    // Only trust explicitly syllabus-hinted filenames. Picking the smallest
    // root PDF as a fallback produced garbage titles (lecture decks, past
    // exams) — better to leave fields blank than display wrong extraction.
    const hinted = rootPdfs.filter((d) => SYLLABUS_HINT_RE.test(d.title));
    if (hinted.length === 0) {
      collectionMeta.push(extractCollectionMetadata(cat.slug, cat.label, '', undefined));
      continue;
    }
    const pick = hinted.sort((a, b) => a.size - b.size)[0];
    const abs = path.join(SRC, pick.sourcePath);
    const text = await extractPdfText(abs);
    collectionMeta.push(
      extractCollectionMetadata(cat.slug, cat.label, text, pick.id),
    );
  }

  // Folder-level topics + teacher harvest. Scan one slide deck per 2nd-level
  // folder (Week N, Assessment N) for the real topic title, and merge teacher
  // names across all slides (syllabus rarely lists them cleanly).
  let folderTopicCount = 0;
  let teacherHarvested = 0;
  for (const meta of collectionMeta) {
    const catDocs = docs.filter((d) => d.categorySlug === meta.categorySlug);
    // Group docs by second-level folder path (e.g. "Week / Week 1").
    type Bucket = { folderPath: string; docs: DocMeta[] };
    const buckets = new Map<string, Bucket>();
    for (const d of catDocs) {
      const raw = (d.subcategory ?? '').trim();
      if (!raw) continue;
      const parts = raw.split(/\s*\/\s*/).map((p) => p.trim()).filter(Boolean);
      if (parts.length < 2) continue;
      const folderPath = parts.slice(0, 2).join(' / ');
      if (!buckets.has(folderPath)) buckets.set(folderPath, { folderPath, docs: [] });
      buckets.get(folderPath)!.docs.push(d);
    }

    const folders: Record<string, FolderTopic> = {};
    const teacherPool = new Set<string>(meta.teachers ?? []);

    for (const { folderPath, docs: folderDocs } of buckets.values()) {
      const pdfs = folderDocs.filter((d) => d.ext === '.pdf');
      if (pdfs.length === 0) continue;
      // Tier-based picking: seminar slide decks are canonical, then anything
      // mentioning "seminar" or "lecture", then slides, then files that carry
      // the folder leaf's name. Avoid picking small companion files like
      // "Preparation Activities" that tend to win on size alone.
      const rank = (title: string): number => {
        const t = title.toLowerCase();
        if (/\b(seminar|lecture)\s+slides?\b/.test(t)) return 100;
        if (/\bseminar\b/.test(t) || /\blecture\b/.test(t)) return 70;
        if (/\bslides?\b/.test(t)) return 55;
        if (/\bnotes?\b/.test(t)) return 45;
        if (/\b(preparation|hands[\s-]?on|case\s+study|activity|activities|exercise|reading|dataset|guide)\b/.test(t))
          return 20;
        return 30; // default "might be the main doc"
      };
      const leaf = folderPath.split('/').pop()?.trim() ?? '';
      const leafRe = leaf ? new RegExp(`\\b${leaf.replace(/\s+/g, '\\s+')}\\b`, 'i') : null;
      const scored = pdfs
        .map((d) => ({ d, score: rank(d.title) + (leafRe && leafRe.test(d.title) ? 5 : 0) }))
        .sort((a, b) => b.score - a.score || b.d.size - a.d.size);
      const pick = scored[0].d;
      const abs = path.join(SRC, pick.sourcePath);
      const firstPage = await extractPdfText(abs, { lastPage: 1, maxChars: 3000 });
      if (!firstPage) continue;

      // Harvest teachers from any first-page (they often appear on slide 1).
      for (const t of harvestTeachers(firstPage)) teacherPool.add(t);

      const topic = extractFolderTopic(firstPage, meta.courseCode);
      if (topic) {
        folders[folderPath] = { title: topic, sourceDocId: pick.id };
        folderTopicCount++;
      }
    }
    if (Object.keys(folders).length > 0) meta.folders = folders;
    if (teacherPool.size > (meta.teachers?.length ?? 0)) {
      const before = meta.teachers?.length ?? 0;
      meta.teachers = Array.from(teacherPool).slice(0, 6);
      teacherHarvested += meta.teachers.length - before;
    }
  }

  await fs.writeFile(
    collectionMetadataPath(),
    JSON.stringify(collectionMeta, null, 2),
    'utf-8',
  );
  console.log(
    `✅ wrote ${collectionMetadataPath()} (${collectionMeta.filter((m) => m.courseName || m.term || m.teachers).length}/${collectionMeta.length} enriched · ${folderTopicCount} folder topics · +${teacherHarvested} teachers)`,
  );
}

export { categorizePath, main as runIngest };

// CLI entry. Under `tsx scripts/ingest-knowledge.ts` import.meta.url matches
// the invoked argv[1]; when imported as a module, it won't, so the main()
// call is skipped.
const isCli = import.meta.url === `file://${process.argv[1]}`;
if (isCli) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
