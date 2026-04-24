'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { subscribeLoomMirror } from '../lib/loom-mirror-store';
import { loadPanelRecords, PANEL_RECORDS_KEY, type LoomPanelRecord } from '../lib/loom-panel-records';

// M16 — Palimpsest. The history of a thought as a stack of layered pages.
//
// Design goal: up to four leaves, each offset down-right from the last,
// top leaf the most-recent thought event (opacity 1), beneath — the
// preceding three events at 0.55 / 0.3 / 0.15. If the focus panel has
// fewer than two thought events there is no history to palimpsest, so
// the surface renders an honest empty state rather than a fabricated
// draft history — inventing past drafts the user never wrote would be
// worse than empty.
//
// Data source: native mode fetches `loom://native/panels.json`
// directly from SwiftData. Each entry carries two complementary
// histories: `revisions: [{priorText, newText, at}]` — the true "draft
// beneath the draft" timeline produced by `LoomTraceWriter.reviseSummary`
// — and the legacy `thoughtEvents: [{text, at}]` — each distinct thought
// captured on the reading, ordered oldest-first. Palimpsest prefers
// revisions when present (≥2 total layers after unpacking priorText +
// newText); otherwise it falls back to thought events. Updates propagate
// via `loom-panels-updated` and `storage` events.

type ThoughtEvent = { text: string; at: number };
type Revision = { priorText: string; newText: string; at: number };

type StoredPanel = Pick<LoomPanelRecord, 'id' | 'title' | 'at' | 'thoughtEvents' | 'revisions'>;

// Internal shape the renderer consumes — each layer is a (text, at) pair.
// Derived from either the revision log or the thought-event log depending
// on which history the focus panel actually has.
type Layer = { text: string; at: number };

type FocusPanel = {
  id: string;
  title: string;
  layers: Layer[];
  // `source` is surfaced to the sub-header so the user can tell which
  // history is backing the rendered stack — "revision layers" vs the
  // older thought-event fallback.
  source: 'revisions' | 'thoughts';
};

function coerceThoughtEvents(raw: unknown): ThoughtEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: ThoughtEvent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as { text?: unknown; at?: unknown };
    const text = typeof obj.text === 'string' ? obj.text : null;
    if (!text) continue;
    const at = typeof obj.at === 'number' && Number.isFinite(obj.at) ? obj.at : 0;
    out.push({ text, at });
  }
  // Defensive re-sort — the native projection already sorts ascending, but
  // we don't want a stale payload to silently render out-of-order.
  out.sort((a, b) => a.at - b.at);
  return out;
}

function coerceRevisions(raw: unknown): Revision[] {
  if (!Array.isArray(raw)) return [];
  const out: Revision[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as { priorText?: unknown; newText?: unknown; at?: unknown };
    const priorText = typeof obj.priorText === 'string' ? obj.priorText : '';
    const newText = typeof obj.newText === 'string' ? obj.newText : '';
    if (!priorText && !newText) continue;
    const at = typeof obj.at === 'number' && Number.isFinite(obj.at) ? obj.at : 0;
    out.push({ priorText, newText, at });
  }
  out.sort((a, b) => a.at - b.at);
  return out;
}

/** Expand a revision log into a flat (text, at) layer list ordered
 *  oldest-first.
 *
 *  A chain of N revisions expands into N+1 layers — the original prior
 *  (beneath the first revision), each successive newText (which becomes
 *  the prior of the next revision), and the final newText at the head.
 *  We de-dupe consecutive equal texts so a no-op revision doesn't
 *  multiply the stack. */
function expandRevisionLayers(revisions: Revision[]): Layer[] {
  if (revisions.length === 0) return [];
  const layers: Layer[] = [];
  // The oldest priorText anchors the bottom of the stack.
  layers.push({ text: revisions[0].priorText, at: revisions[0].at });
  for (const r of revisions) {
    // Each revision's newText is the new "current" at its timestamp.
    // Skip pure no-ops where newText matches the most recently-pushed
    // layer — preserves the "≥2 distinct versions" invariant the empty
    // state relies on.
    const last = layers[layers.length - 1];
    if (last && last.text === r.newText) {
      // Prefer the later timestamp so the layer's date reflects the
      // latest attempt, even if the text didn't change.
      last.at = r.at;
      continue;
    }
    layers.push({ text: r.newText, at: r.at });
  }
  return layers;
}

async function loadPanels(): Promise<StoredPanel[]> {
  return loadPanelRecords();
}

function pickFocusPanel(panels: StoredPanel[], overrideId: string | null): FocusPanel | null {
  if (panels.length === 0) return null;
  const resolve = (p: StoredPanel): FocusPanel => {
    const revisions = coerceRevisions(p.revisions);
    const revisionLayers = expandRevisionLayers(revisions);
    // ≥2 layers = a real palimpsest (at least one prior + one current).
    if (revisionLayers.length >= 2) {
      return {
        id: typeof p.id === 'string' ? p.id : '',
        title: typeof p.title === 'string' && p.title ? p.title : 'Untitled',
        layers: revisionLayers,
        source: 'revisions',
      };
    }
    // Fall back to the legacy thought-event timeline. These aren't true
    // revisions of the same thought — they're distinct thoughts captured
    // across a reading — but they're the best approximation of "history"
    // on panels written before the revision schema landed.
    const events = coerceThoughtEvents(p.thoughtEvents);
    return {
      id: typeof p.id === 'string' ? p.id : '',
      title: typeof p.title === 'string' && p.title ? p.title : 'Untitled',
      layers: events.map((e) => ({ text: e.text, at: e.at })),
      source: 'thoughts',
    };
  };

  if (overrideId) {
    const match = panels.find((p) => p.id === overrideId);
    if (match) return resolve(match);
  }

  // Most recent by `at`, falling back to 0 for missing timestamps.
  let best: StoredPanel | null = null;
  let bestAt = -Infinity;
  for (const p of panels) {
    const at = typeof p.at === 'number' ? p.at : 0;
    if (at >= bestAt) {
      bestAt = at;
      best = p;
    }
  }
  return best ? resolve(best) : null;
}

// Italic-serif date helper. Palimpsest layers are dated in lowercase
// "17 mar" / "today, 14:02" style — continuous with the rest of the
// Vellum surface (Patterns' `sub`, PanelDetail's `drawnAt`).
function formatRelativeDate(at: number, now: Date = new Date()): string {
  if (!at || !Number.isFinite(at)) return '';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';

  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `today, ${hh}:${mm}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (isYesterday) return 'yesterday';

  const mon = d.toLocaleString('en-US', { month: 'short' }).toLowerCase();
  const day = d.getDate();
  const sameYear = d.getFullYear() === now.getFullYear();
  if (sameYear) return `${day} ${mon}`;
  const yr = String(d.getFullYear()).slice(2);
  return `${day} ${mon} \u2018${yr}`;
}

// Deterministic layer slot — highest index (most recent) maps to
// `.is-current`, then `.is-2`, `.is-3`, `.is-4` as we walk back.
const LAYER_CLASSES = ['is-current', 'is-2', 'is-3', 'is-4'] as const;

export function PalimpsestClient() {
  const [panels, setPanels] = useState<StoredPanel[]>([]);
  const [overrideId, setOverrideId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const next = await loadPanels();
      if (!cancelled) setPanels(next);
    };
    const search = new URLSearchParams(window.location.search);
    setOverrideId(search.get('focus'));
    void refresh();
    const dispose = subscribeLoomMirror(PANEL_RECORDS_KEY, 'loom-panels-updated', () => {
      void refresh();
    });
    return () => {
      cancelled = true;
      dispose();
    };
  }, []);

  const focus = useMemo(() => pickFocusPanel(panels, overrideId), [panels, overrideId]);

  // Require at least two layers — one draft is not yet a palimpsest.
  const hasHistory = focus !== null && focus.layers.length >= 2;

  if (!hasHistory) {
    return (
      <div className="loom-palimpsest">
        <header className="loom-palimpsest-header">
          <div className="loom-palimpsest-eyebrow">Palimpsest</div>
          <h1 className="loom-palimpsest-title">Palimpsest.</h1>
          <p className="loom-palimpsest-subtitle">No draft has layers yet.</p>
        </header>

        <div className="loom-empty-state" role="note">
          <div className="loom-empty-state-ornament" aria-hidden="true">── · ──</div>
          <p className="loom-empty-state-copy">
            Palimpsest shows the history of a thought — the draft beneath
            the draft. It fills in as you revise what you&apos;ve written.
          </p>
          <Link href="/workbench" className="loom-empty-state-action">
            Workbench →
          </Link>
        </div>
      </div>
    );
  }

  // Newest first: pop the tail. Cap at four layers so the stack keeps
  // its legibility — deeper history is still there in the store, we
  // just don't render past the fourth leaf because it fades to 0.15.
  const newestFirst = [...focus.layers].reverse().slice(0, LAYER_CLASSES.length);

  // Subtitle tracks the underlying history source — revisions are the
  // true "draft beneath the draft"; thoughts are the legacy fallback.
  const subtitle =
    focus.source === 'revisions'
      ? `The thought\u2019s revision history, ${newestFirst.length} layers.`
      : `The thought\u2019s history, ${newestFirst.length} layers.`;

  return (
    <div className="loom-palimpsest">
      <header className="loom-palimpsest-header">
        <div className="loom-palimpsest-eyebrow">Palimpsest</div>
        <h1 className="loom-palimpsest-title">Palimpsest.</h1>
        <p className="loom-palimpsest-subtitle">{subtitle}</p>
      </header>

      <div className="loom-palimpsest-stack">
        {newestFirst.map((layer, i) => {
          const cls = LAYER_CLASSES[i];
          return (
            <article
              key={`${layer.at}-${i}`}
              className={`loom-palimpsest-layer ${cls}`}
              aria-current={i === 0 ? 'true' : undefined}
            >
              <div className="loom-palimpsest-date">{formatRelativeDate(layer.at)}</div>
              <p className="loom-palimpsest-text">{layer.text}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
