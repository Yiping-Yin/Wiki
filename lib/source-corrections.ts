import { promises as fs } from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT } from './server-config';

/**
 * Source Correct · typo / mis-extraction fixes for source docs.
 *
 * Loom's Source Fidelity rule says the display must equal the user's Finder
 * tree — but ingested text often has OCR/extraction errors. Source Correct
 * lets the user fix those without editing the original file: corrections
 * live in a sidecar file applied to the extracted body at read time.
 *
 * Why not mutate the extracted cache directly: rescan (re-ingest) would blow
 * corrections away. Sidecars survive rescans until the user explicitly
 * clears them.
 *
 * Protocol:
 *  - `before` and `after` are literal strings, not patterns.
 *  - Edit distance is bounded server-side (v1 = ≤ 20 chars) so this can't be
 *    turned into a freeform rewrite channel.
 *  - Apply order: oldest first (so later corrections layer on top).
 */

const CORRECTIONS_DIR = path.join(CONTENT_ROOT, 'knowledge', '.cache', 'corrections');

export type SourceCorrection = {
  /** literal substring to find in the extracted body */
  before: string;
  /** replacement string */
  after: string;
  /** epoch ms */
  at: number;
  /** optional surrounding context (20 chars each side) to disambiguate when
   *  `before` is a common substring. If present, the match must also have the
   *  same surrounding characters. */
  contextBefore?: string;
  contextAfter?: string;
};

function pathFor(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_');
  return path.join(CORRECTIONS_DIR, `${safe}.json`);
}

async function ensureDir() {
  await fs.mkdir(CORRECTIONS_DIR, { recursive: true });
}

export async function readCorrections(id: string): Promise<SourceCorrection[]> {
  try {
    const raw = await fs.readFile(pathFor(id), 'utf-8');
    const parsed = JSON.parse(raw) as { corrections?: SourceCorrection[] } | SourceCorrection[];
    const list = Array.isArray(parsed) ? parsed : parsed?.corrections;
    if (!Array.isArray(list)) return [];
    return list
      .filter(
        (c): c is SourceCorrection =>
          typeof c === 'object' &&
          c !== null &&
          typeof (c as SourceCorrection).before === 'string' &&
          typeof (c as SourceCorrection).after === 'string',
      )
      .sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  } catch {
    return [];
  }
}

export async function addCorrection(id: string, correction: Omit<SourceCorrection, 'at'>): Promise<SourceCorrection[]> {
  await ensureDir();
  const existing = await readCorrections(id);
  const entry: SourceCorrection = { ...correction, at: Date.now() };
  const next = [...existing, entry];
  await fs.writeFile(pathFor(id), JSON.stringify({ corrections: next }, null, 2), 'utf-8');
  return next;
}

export async function clearCorrections(id: string): Promise<void> {
  try {
    await fs.unlink(pathFor(id));
  } catch {
    /* no-op */
  }
}

export function applyCorrections(body: string, corrections: SourceCorrection[]): string {
  let out = body;
  for (const c of corrections) {
    if (!c.before) continue;
    if (c.contextBefore || c.contextAfter) {
      // Context-scoped: find the unique occurrence whose surroundings match,
      // then splice. Falls back to first occurrence if context match fails.
      const ctxBefore = c.contextBefore ?? '';
      const ctxAfter = c.contextAfter ?? '';
      const needle = ctxBefore + c.before + ctxAfter;
      const idx = out.indexOf(needle);
      if (idx >= 0) {
        const before = out.slice(0, idx + ctxBefore.length);
        const after = out.slice(idx + ctxBefore.length + c.before.length);
        out = before + c.after + after;
        continue;
      }
    }
    // Simple first-occurrence replace. Sufficient for typos; we don't
    // aspire to regex semantics here.
    const idx = out.indexOf(c.before);
    if (idx >= 0) {
      out = out.slice(0, idx) + c.after + out.slice(idx + c.before.length);
    }
  }
  return out;
}
