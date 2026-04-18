'use client';
/**
 * PatternSwatch · a tiny woven tile representing one collection (course / wiki section).
 *
 * Reads panels and weaves tied to the given knowledge collection and renders a
 * small tapestry showing what has actually settled there. Same physics as
 * PatternsView, but compressed to a card-sized swatch.
 *
 * Used as the replacement for "App Store style" CollectionCard on /knowledge,
 * /browse, etc. Each card is the actual texture of your engagement, not a
 * decorative tinted box.
 */
import { useMemo } from 'react';
import { useAllPanels } from '../lib/panel';
import { useAllWeaves } from '../lib/weave';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const VISIBLE_WEEKS = 12;

type CellInfo = {
  intensity: number;
  mastery: number;
  crystallized: boolean;
};

function buildSwatchCells(
  panels: Array<{
    docId: string;
    href: string;
    status: 'settled' | 'provisional' | 'contested' | 'superseded';
    crystallizedAt: number;
    revisions: Array<{ at: number }>;
  }>,
  weaves: Array<{
    fromPanelId: string;
    toPanelId: string;
    status: 'suggested' | 'confirmed' | 'rejected';
    updatedAt: number;
  }>,
  categorySlug: string,
): CellInfo[] {
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

  const collectionPanels = panels.filter((panel) => panel.href.startsWith(`/knowledge/${categorySlug}/`));
  const collectionPanelIds = new Set(collectionPanels.map((panel) => panel.docId));

  for (const panel of collectionPanels) {
    const panelEvents = [panel.crystallizedAt, ...panel.revisions.map((revision) => revision.at)];
    for (const at of panelEvents) {
      if (!at) continue;
      const ageWeeks = Math.floor((nowMs - at) / WEEK_MS);
      const idx = VISIBLE_WEEKS - 1 - ageWeeks;
      if (idx < 0 || idx >= VISIBLE_WEEKS) continue;
      cells[idx].intensity += at === panel.crystallizedAt ? 1 : 0.55;
      const mastery =
        panel.status === 'settled'
          ? 0.9
          : panel.status === 'contested'
            ? 0.58
            : 0.35;
      cells[idx].mastery = Math.max(cells[idx].mastery, mastery);
      if (panel.status === 'settled' && at === panel.crystallizedAt) {
        cells[idx].crystallized = true;
      }
    }
  }

  for (const weave of weaves) {
    if (weave.status !== 'confirmed') continue;
    if (!collectionPanelIds.has(weave.fromPanelId) && !collectionPanelIds.has(weave.toPanelId)) continue;
    const ageWeeks = Math.floor((nowMs - weave.updatedAt) / WEEK_MS);
    const idx = VISIBLE_WEEKS - 1 - ageWeeks;
    if (idx < 0 || idx >= VISIBLE_WEEKS) continue;
    cells[idx].intensity += 0.35;
    cells[idx].mastery = Math.max(cells[idx].mastery, 0.95);
    cells[idx].crystallized = true;
  }

  if (collectionPanels.length === 0) {
    return cells;
  }

  for (const cell of cells) {
    if (cell.intensity < 0.05) {
      cell.mastery = 0;
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

export function PatternSwatch({
  categorySlug,
  width,
  height = 36,
}: {
  categorySlug: string;
  /** Pass a number for fixed width, or omit for full width (100%) */
  width?: number;
  height?: number;
}) {
  const { panels, loading: panelsLoading } = useAllPanels();
  const { weaves, loading: weavesLoading } = useAllWeaves();
  const cells = useMemo(() => {
    if (panelsLoading || weavesLoading) return null;
    return buildSwatchCells(panels, weaves, categorySlug);
  }, [categorySlug, panels, panelsLoading, weaves, weavesLoading]);

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
