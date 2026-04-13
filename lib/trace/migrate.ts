'use client';
/**
 * One-time migration · localStorage → IndexedDB Traces.
 *
 * Scans the legacy localStorage keys created by older Loom (formerly "wiki")
 * and creates corresponding Traces in the new IndexedDB store.
 *
 *  Legacy key                    →  Trace shape
 *  wiki:notes:<docId>            →  reading-kind Trace bound to <docId>, with note events
 *  wiki:highlights:<docId>       →  highlight events on the same Trace
 *  wiki:quiz:results:v1          →  events on the relevant Trace (or stand-alone summary)
 *  wiki:history:v1 (use-history) →  visit events
 *  wiki:pins:v1                  →  pinnedAt metadata on the relevant Trace
 *
 * The migration is idempotent: it sets a localStorage flag once it succeeds
 * and never re-runs unless the flag is removed manually.
 *
 * Original localStorage keys are NOT deleted — they remain as a fallback for
 * any component that hasn't yet been migrated to read from Traces.
 */

import type { Trace, TraceEvent } from './types';
import { traceStore } from './store';

const FLAG_KEY = 'loom:migrated:v1';

type LegacyHighlight = { text: string; tint: string; at: number };
type LegacyHistory = { id: string; title: string; href: string; viewedAt: number }[];
type LegacyQuizResult = { docId: string; score: number; total: number; attemptedAt: number };
type LegacyPin = { id: string; title: string; href: string; pinnedAt: number };

function isClient(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function inferHrefFromDocId(docId: string): string {
  // wiki/<slug> → /wiki/<slug>
  const w = docId.match(/^wiki\/(.+)$/);
  if (w) return `/wiki/${w[1]}`;
  // know/<categorySlug>__<fileSlug> → /knowledge/<cat>/<file>
  const k = docId.match(/^know\/([^_]+(?:_[^_]+)*)__(.+)$/);
  if (k) return `/knowledge/${k[1]}/${k[2]}`;
  return '#';
}

function inferTitleFromDocId(docId: string): string {
  const cleaned = docId
    .replace(/^wiki\//, '')
    .replace(/^know\//, '')
    .replace(/^.*__/, '')
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
    .trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** Run migration once. Safe to call on every page load. */
export async function migrateLegacyData(): Promise<{ migrated: boolean; created: number; reason?: string }> {
  if (!isClient()) return { migrated: false, created: 0, reason: 'server' };

  // Already migrated?
  if (localStorage.getItem(FLAG_KEY)) {
    return { migrated: false, created: 0, reason: 'already-migrated' };
  }

  let created = 0;

  try {
    // 1. Collect all docIds we know about (from notes + highlights keys)
    const docIds = new Set<string>();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith('wiki:notes:')) docIds.add(key.slice('wiki:notes:'.length));
      if (key.startsWith('wiki:highlights:')) docIds.add(key.slice('wiki:highlights:'.length));
    }

    // 2. Load history for visit events lookup
    let history: LegacyHistory = [];
    try {
      const raw = localStorage.getItem('wiki:history:v1');
      if (raw) history = JSON.parse(raw);
    } catch {}

    // 2b. Load pins so pin-only docs also get a trace
    let pins: LegacyPin[] = [];
    try {
      const raw = localStorage.getItem('wiki:pins:v1');
      if (raw) pins = JSON.parse(raw);
    } catch {}
    for (const p of pins) docIds.add(p.id);

    // 3. Load quiz results
    let quizzes: LegacyQuizResult[] = [];
    try {
      const raw = localStorage.getItem('wiki:quiz:results:v1');
      if (raw) quizzes = JSON.parse(raw);
    } catch {}

    // 4. For each doc, create a Trace
    for (const docId of docIds) {
      const events: TraceEvent[] = [];

      // Notes → note events
      try {
        const notesRaw = localStorage.getItem(`wiki:notes:${docId}`);
        if (notesRaw && notesRaw.trim()) {
          events.push({
            kind: 'note',
            content: notesRaw,
            at: Date.now() - 1000, // pseudo-timestamp; we don't have the original
          });
        }
      } catch {}

      // Highlights → highlight events
      try {
        const hlRaw = localStorage.getItem(`wiki:highlights:${docId}`);
        if (hlRaw) {
          const hls: LegacyHighlight[] = JSON.parse(hlRaw);
          for (const h of hls) {
            events.push({
              kind: 'highlight',
              text: h.text,
              tint: h.tint,
              at: h.at ?? Date.now(),
            });
          }
        }
      } catch {}

      // Visits from history
      const docVisits = history.filter((h) => h.id === docId);
      for (const v of docVisits) {
        events.push({
          kind: 'visit',
          at: v.viewedAt,
        });
      }

      // Quizzes — match by stripped docId (legacy format used `_` instead of `__`)
      const strippedId = docId.replace(/^know\//, '').replace(/^wiki\//, '');
      const docQuizzes = quizzes.filter((q) =>
        q.docId === strippedId || q.docId === docId || q.docId === strippedId.replace(/__/g, '_')
      );
      for (const q of docQuizzes) {
        const pct = q.total > 0 ? q.score / q.total : 0;
        events.push({
          kind: 'mastery-update',
          from: 0,
          to: pct,
          reason: `quiz: ${q.score}/${q.total}`,
          at: q.attemptedAt,
        });
      }

      const legacyPin = pins.find((p) => p.id === docId);

      // If there's at least one event OR a pin, create the Trace
      if (events.length > 0 || legacyPin) {
        // Sort events by timestamp
        events.sort((a, b) => a.at - b.at);

        const firstHistory = docVisits[0];
        const title = firstHistory?.title ?? legacyPin?.title ?? inferTitleFromDocId(docId);
        const href = firstHistory?.href ?? legacyPin?.href ?? inferHrefFromDocId(docId);

        const createdTrace = await traceStore.create({
          kind: 'reading',
          title,
          source: {
            docId,
            href,
            sourceTitle: title,
          },
          initialEvents: events,
        });
        if (legacyPin?.pinnedAt) {
          await traceStore.update(createdTrace.id, { pinnedAt: legacyPin.pinnedAt });
        }
        created++;
      }
    }

    localStorage.setItem(FLAG_KEY, String(Date.now()));
    return { migrated: true, created };
  } catch (e: any) {
    return { migrated: false, created, reason: e.message };
  }
}

/** Force re-run migration (deletes the flag). Used by dev inspector. */
export function resetMigrationFlag(): void {
  if (!isClient()) return;
  localStorage.removeItem(FLAG_KEY);
}

/** Check if migration has run. */
export function isMigrated(): boolean {
  if (!isClient()) return false;
  return !!localStorage.getItem(FLAG_KEY);
}
