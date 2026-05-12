import { promises as fs } from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT } from './server-config';
import { loomUserDataRoot } from './paths';

/**
 * Phase 7.2 · Per-pursuit hide sidecar (web / dev mode).
 *
 * Mirrors `lib/schema-corrections.ts` but stores per-pursuit hide
 * dismissals rather than schema field corrections. Hides are
 * reversible — never delete; the sidecar carries an array of hidden
 * pursuit ids per sourceDocId, and `restore` removes an id from
 * that array.
 *
 * Storage:
 *   <LOOM_USER_DATA_ROOT>/knowledge/.cache/pursuit-hide/<slug>.json
 *
 * In native mode the same path is read by Swift's `PursuitHideStore`
 * so both paths converge on one sidecar per source. Writes in native
 * mode go through `loomPursuitHide.postMessage` rather than this
 * module.
 */

const HIDE_DIR = path.join(
  loomUserDataRoot(),
  'knowledge',
  '.cache',
  'pursuit-hide',
);

const LEGACY_HIDE_DIR = path.join(
  CONTENT_ROOT,
  'knowledge',
  '.cache',
  'pursuit-hide',
);

export type PursuitHideFile = {
  sourceDocId: string;
  hiddenPursuitIds: string[];
};

function slugify(value: string): string {
  // Same rule as `Swift PursuitHideStore.slugified` — kept aligned so
  // the two writers don't drift on the path name.
  let out = '';
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    const isLower = code >= 0x61 && code <= 0x7a;
    const isUpper = code >= 0x41 && code <= 0x5a;
    const isDigit = code >= 0x30 && code <= 0x39;
    const isDash = ch === '-' || ch === '_';
    const isCJK = code >= 0x4e00 && code <= 0x9fa5;
    out += isLower || isUpper || isDigit || isDash || isCJK ? ch : '_';
  }
  return out;
}

function pathFor(sourceDocId: string, root = HIDE_DIR): string {
  return path.join(root, `${slugify(sourceDocId)}.json`);
}

function readPathsFor(sourceDocId: string): string[] {
  const primary = pathFor(sourceDocId);
  const legacy = pathFor(sourceDocId, LEGACY_HIDE_DIR);
  return primary === legacy ? [primary] : [primary, legacy];
}

export async function readPursuitHide(sourceDocId: string): Promise<string[]> {
  for (const candidate of readPathsFor(sourceDocId)) {
    try {
      const raw = await fs.readFile(candidate, 'utf-8');
      const parsed = JSON.parse(raw) as PursuitHideFile;
      return Array.isArray(parsed.hiddenPursuitIds) ? parsed.hiddenPursuitIds : [];
    } catch {}
  }
  return [];
}

export async function hidePursuit(
  pursuitId: string,
  sourceDocId: string,
): Promise<string[]> {
  const file = pathFor(sourceDocId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const existing = await readPursuitHide(sourceDocId);
  if (existing.includes(pursuitId)) return existing;
  const next = [...existing, pursuitId];
  const out: PursuitHideFile = { sourceDocId, hiddenPursuitIds: next };
  await fs.writeFile(file, JSON.stringify(out, null, 2), 'utf-8');
  return next;
}

export async function restorePursuit(
  pursuitId: string,
  sourceDocId: string,
): Promise<string[]> {
  const file = pathFor(sourceDocId);
  const existing = await readPursuitHide(sourceDocId);
  if (!existing.includes(pursuitId)) return existing;
  const next = existing.filter((id) => id !== pursuitId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const out: PursuitHideFile = { sourceDocId, hiddenPursuitIds: next };
  await fs.writeFile(file, JSON.stringify(out, null, 2), 'utf-8');
  return next;
}
