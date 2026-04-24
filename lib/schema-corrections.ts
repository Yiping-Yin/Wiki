import { promises as fs } from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT } from './server-config';

/**
 * Phase 7.1 · Schema corrections sidecar (web / dev mode).
 *
 * Mirrors `lib/source-corrections.ts` but stores user edits on extracted
 * schema fields (`courseCode`, `term`, `teachers[0].name`, ...) rather
 * than free-text source corrections. Never mutates the extractor output
 * in `LoomTrace.eventsJSON` — the corrections layer applies at read time.
 *
 * Storage:
 *   <CONTENT_ROOT>/knowledge/.cache/schema-corrections/
 *       <extractorId>/<slugified-sourceDocId>.json
 *
 * In native mode the same path is read by Swift's `SchemaCorrectionsStore`
 * so both paths converge on one sidecar per (extractor, source) pair.
 * Writes in native mode go through `loomSchemaCorrections.postMessage`
 * (see `LoomSchemaCorrectionsBridgeHandler.swift`) rather than this
 * route — the shipped app has no Next.js server.
 */

const CORRECTIONS_DIR = path.join(
  CONTENT_ROOT,
  'knowledge',
  '.cache',
  'schema-corrections',
);

export type SchemaCorrection = {
  fieldPath: string;
  original: string;
  corrected: string;
  at: number;
};

export type SchemaCorrectionsFile = {
  extractorId: string;
  sourceDocId: string;
  corrections: SchemaCorrection[];
};

function slugify(value: string): string {
  // Mirrors the Swift slug rule in `SchemaCorrectionsStore.slugified` —
  // allow alphanumerics, dash, underscore, and CJK; everything else
  // becomes `_`. Keeps paths cross-OS safe without collapsing doc ids
  // whose prefixes match (e.g. `ingested:A.pdf` vs `ingested:B.pdf`).
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

function pathFor(extractorId: string, sourceDocId: string): string {
  return path.join(
    CORRECTIONS_DIR,
    slugify(extractorId),
    `${slugify(sourceDocId)}.json`,
  );
}

export async function readSchemaCorrections(
  extractorId: string,
  sourceDocId: string,
): Promise<SchemaCorrection[]> {
  try {
    const raw = await fs.readFile(pathFor(extractorId, sourceDocId), 'utf-8');
    const parsed = JSON.parse(raw) as SchemaCorrectionsFile | { corrections?: SchemaCorrection[] };
    const list = Array.isArray((parsed as SchemaCorrectionsFile).corrections)
      ? (parsed as SchemaCorrectionsFile).corrections
      : [];
    return list
      .filter(
        (c): c is SchemaCorrection =>
          !!c &&
          typeof c === 'object' &&
          typeof (c as SchemaCorrection).fieldPath === 'string' &&
          typeof (c as SchemaCorrection).corrected === 'string',
      )
      .sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  } catch {
    return [];
  }
}

export async function appendSchemaCorrection(
  extractorId: string,
  sourceDocId: string,
  entry: Omit<SchemaCorrection, 'at'>,
): Promise<SchemaCorrection[]> {
  const file = pathFor(extractorId, sourceDocId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const existing = await readSchemaCorrections(extractorId, sourceDocId);
  const next: SchemaCorrection[] = [...existing, { ...entry, at: Date.now() }];
  const out: SchemaCorrectionsFile = {
    extractorId,
    sourceDocId,
    corrections: next,
  };
  await fs.writeFile(file, JSON.stringify(out, null, 2), 'utf-8');
  return next;
}

/**
 * Apply a set of corrections on top of a raw schema object. Corrections
 * are ordered oldest-first; later corrections for the same `fieldPath`
 * win. Returns a new object; the input is not mutated.
 *
 * Supported `fieldPath` shapes (Phase 7.1 scope):
 *   - `courseCode`
 *   - `courseName`
 *   - `term`
 *   - `institution`
 *   - `officeHours`
 *   - `textbook`
 *   - `teachers[0].name`
 *   - `assessmentItems[2].name`
 *   - `assessmentItems[2].dueDate`
 *
 * The resolver walks the path segment-by-segment; every leaf is a
 * `FieldResult<T>` shape (`{status: "found", value: ...}`) or, when a
 * field's status was `not_found`, an object without `value`. Writes
 * replace the `value` field and mark `status: "found"` — same shape
 * the extractor produces, so downstream consumers don't need special-
 * case handling for "user-corrected" values.
 */
export function applySchemaCorrections<T extends Record<string, unknown>>(
  schema: T,
  corrections: SchemaCorrection[],
): T {
  if (!corrections.length) return schema;
  // Deep clone via JSON round-trip — schemas are small and fully
  // JSON-serialisable (see `AnyIngestResult.encodeJSON` in Swift).
  const next = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
  for (const c of corrections) {
    applyAt(next, c.fieldPath, c.corrected);
  }
  return next as T;
}

function applyAt(root: Record<string, unknown>, fieldPath: string, corrected: string): void {
  const segments = parsePath(fieldPath);
  if (!segments.length) return;
  let container: Record<string, unknown> | unknown[] = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const seg = segments[i];
    const next = seg.kind === 'index'
      ? (container as unknown[])[seg.index]
      : (container as Record<string, unknown>)[seg.name];
    if (next === undefined || next === null || typeof next !== 'object') return;
    container = next as Record<string, unknown> | unknown[];
  }
  const tail = segments[segments.length - 1];
  const host =
    tail.kind === 'index'
      ? (container as unknown[])[tail.index]
      : (container as Record<string, unknown>)[tail.name];
  if (host && typeof host === 'object' && !Array.isArray(host)) {
    // Leaf is a FieldResult — overwrite the value + status. This
    // is the common case today (every leaf in SyllabusSchema).
    (host as Record<string, unknown>).status = 'found';
    (host as Record<string, unknown>).value = corrected;
    (host as Record<string, unknown>).userCorrected = true;
  } else {
    // Non-FieldResult leaf — replace in-place. Kept as a fallback
    // for future extractor shapes that omit the wrapper.
    if (tail.kind === 'index') {
      (container as unknown[])[tail.index] = corrected;
    } else {
      (container as Record<string, unknown>)[tail.name] = corrected;
    }
  }
}

type PathSegment =
  | { kind: 'name'; name: string }
  | { kind: 'index'; index: number };

function parsePath(path: string): PathSegment[] {
  const segments: PathSegment[] = [];
  const re = /([^\.\[\]]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(path)) !== null) {
    if (match[1] !== undefined) {
      segments.push({ kind: 'name', name: match[1] });
    } else if (match[2] !== undefined) {
      segments.push({ kind: 'index', index: Number(match[2]) });
    }
  }
  return segments;
}
