import { promises as fs } from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT } from './server-config';

/**
 * Phase 7.3 · Dismissal sidecar (web / dev mode).
 *
 * Strict mirror of `lib/schema-corrections.ts`. When the user
 * right-clicks a gray-outlined extractor anchor and chooses
 * "dismiss", the fingerprint persists here so the same anchor
 * doesn't reappear after reload. Slug rule and JSON shape match
 * `ExtractorAnchorsDismissedStore.swift` so both runtime paths
 * converge on a single sidecar file per reading docId.
 *
 * Storage:
 *   <CONTENT_ROOT>/knowledge/.cache/extractor-anchors-dismissed/
 *       <slugified-docId>.json
 *
 * In native mode the same path is read by Swift's
 * `ExtractorAnchorsDismissedStore`. Native writes happen through
 * `loomExtractorAnchors.postMessage`; this module only runs in dev /
 * browser mode behind `/api/extractor-anchors-dismissed`.
 */

const DISMISSED_DIR = path.join(
  CONTENT_ROOT,
  'knowledge',
  '.cache',
  'extractor-anchors-dismissed',
);

export type DismissedFile = {
  docId: string;
  dismissedFingerprints: string[];
};

function slugify(value: string): string {
  // Mirror Swift `ExtractorAnchorsDismissedStore.slugified` — allow
  // alphanumerics, dash, underscore, CJK; everything else → `_`.
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

function pathFor(docId: string): string {
  return path.join(DISMISSED_DIR, `${slugify(docId)}.json`);
}

export async function readDismissedFingerprints(docId: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(pathFor(docId), 'utf-8');
    const parsed = JSON.parse(raw) as DismissedFile;
    const list = Array.isArray(parsed.dismissedFingerprints)
      ? parsed.dismissedFingerprints
      : [];
    return list.filter((s): s is string => typeof s === 'string' && s.length > 0);
  } catch {
    return [];
  }
}

export async function appendDismissedFingerprint(
  docId: string,
  fingerprint: string,
): Promise<string[]> {
  const file = pathFor(docId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const existing = await readDismissedFingerprints(docId);
  const next = Array.from(new Set([...existing, fingerprint])).sort();
  const out: DismissedFile = {
    docId,
    dismissedFingerprints: next,
  };
  await fs.writeFile(file, JSON.stringify(out, null, 2), 'utf-8');
  return next;
}
