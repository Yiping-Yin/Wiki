'use client';
/**
 * KesiSwatch · a tiny woven tile representing one collection (course / wiki section).
 *
 * Reads all traces tied to docs in the given category and renders a small
 * tapestry showing weeks of activity. Same physics as KesiView, but compressed
 * to a card-sized swatch.
 *
 * Used as the replacement for "App Store style" CollectionCard on /knowledge,
 * /browse, etc. Each card is the actual texture of your engagement, not a
 * decorative tinted box.
 */
import { useEffect, useState } from 'react';
import { traceStore, type Trace } from '../lib/trace';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const VISIBLE_WEEKS = 12;

type CellInfo = {
  intensity: number;
  mastery: number;
  crystallized: boolean;
};

function buildSwatchCells(traces: Trace[], categorySlug: string): CellInfo[] {
  // Anchor "now" to start of current week
  const now = new Date();
  const dayOfWeek = (now.getDay() + 6) % 7;
  const thisWeekStart = new Date(now);
  thisWeekStart.setHours(0, 0, 0, 0);
  thisWeekStart.setDate(thisWeekStart.getDate() - dayOfWeek);
  const nowMs = thisWeekStart.getTime();

  const cells: CellInfo[] = Array.from({ length: VISIBLE_WEEKS }, () => ({
    intensity: 0, mastery: 0, crystallized: false,
  }));

  for (const t of traces) {
    if (t.parentId !== null) continue;
    if (!t.source?.docId) continue;
    // Match by docId starting with the category slug
    const docId = t.source.docId;
    if (!docId.startsWith('know/') && !docId.startsWith('wiki/')) continue;
    if (docId.startsWith('know/') && !docId.includes(categorySlug)) continue;

    for (const e of t.events) {
      const ageWeeks = Math.floor((nowMs - e.at) / WEEK_MS);
      const idx = VISIBLE_WEEKS - 1 - ageWeeks;
      if (idx < 0 || idx >= VISIBLE_WEEKS) continue;
      const weight =
        e.kind === 'message' ? 1 :
        e.kind === 'highlight' ? 0.5 :
        e.kind === 'note' ? 0.7 :
        e.kind === 'visit' ? 0.3 : 0.2;
      cells[idx].intensity += weight;
      cells[idx].mastery = Math.max(cells[idx].mastery, t.mastery);
      if (e.kind === 'crystallize') cells[idx].crystallized = true;
    }
  }

  // Normalize
  const max = Math.max(...cells.map((c) => c.intensity), 1);
  return cells.map((c) => ({ ...c, intensity: c.intensity / max }));
}

function cellFill(intensity: number, mastery: number): string {
  if (intensity < 0.05) return 'transparent';
  const a = 0.20 + intensity * 0.75;
  if (mastery < 0.35) {
    return `color-mix(in srgb, var(--tint-indigo) ${(a * 100).toFixed(0)}%, transparent)`;
  } else if (mastery < 0.7) {
    return `color-mix(in srgb, var(--tint-purple) ${(a * 100).toFixed(0)}%, transparent)`;
  } else {
    return `color-mix(in srgb, var(--tint-yellow) ${(a * 100).toFixed(0)}%, transparent)`;
  }
}

export function KesiSwatch({
  categorySlug,
  width,
  height = 36,
}: {
  categorySlug: string;
  /** Pass a number for fixed width, or omit for full width (100%) */
  width?: number;
  height?: number;
}) {
  const [cells, setCells] = useState<CellInfo[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    traceStore.getAll().then((all) => {
      if (cancelled) return;
      setCells(buildSwatchCells(all, categorySlug));
    });
    const onChange = () => {
      traceStore.getAll().then((all) => {
        if (!cancelled) setCells(buildSwatchCells(all, categorySlug));
      });
    };
    window.addEventListener('loom:trace:changed', onChange);
    return () => {
      cancelled = true;
      window.removeEventListener('loom:trace:changed', onChange);
    };
  }, [categorySlug]);

  // Render warp lines + cells
  const rendered = cells ?? Array.from({ length: VISIBLE_WEEKS }, () => ({ intensity: 0, mastery: 0, crystallized: false }));

  return (
    <div style={{
      width: width ?? '100%', height,
      display: 'grid',
      gridTemplateColumns: `repeat(${VISIBLE_WEEKS}, 1fr)`,
      gap: 1,
      position: 'relative',
      borderRadius: 4,
      overflow: 'hidden',
    }}>
      {/* Warp threads — always visible underlying structure */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0,
        backgroundImage: `repeating-linear-gradient(90deg,
          var(--mat-border) 0,
          var(--mat-border) 0.5px,
          transparent 0.5px,
          transparent calc(100% / ${VISIBLE_WEEKS})
        )`,
        opacity: 0.55,
        pointerEvents: 'none',
      }} />
      {rendered.map((c, i) => (
        <div
          key={i}
          style={{
            background: cellFill(c.intensity, c.mastery),
            border: c.crystallized ? '0.5px solid var(--tint-yellow)' : 'none',
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}
