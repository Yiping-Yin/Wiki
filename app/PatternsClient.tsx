'use client';

/**
 * PatternsClient — habitat surface for held panels.
 *
 * Renders crystallized panels as a kesi-mosaic grid: paper tiles with a
 * colored top band, a small "PANEL" eyebrow with a rotated diamond, a
 * big Cormorant italic title (allows \n for line breaks), a serif italic
 * subtitle ("3 sources · mar"), and a muted kesi mini-weave SVG at the
 * lower-right corner. Big tiles span both grid rows.
 *
 * Data source:
 *   Native mode prefers `loom://native/panels.json` so the habitat can
 *   fetch held panels directly from SwiftData. Plain-browser preview
 *   still falls back through the shared panel-record helper. When both
 *   are empty or absent, the view renders an honest empty state — fake
 *   seed content would misrepresent the user's own thinking. See
 *   feedback_learn_not_organize.
 *
 * Design reference:
 *   /Users/yinyiping/Downloads/Wiki Logo/loom-habitat.jsx → PatternsSurface
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { subscribeLoomMirror } from '../lib/loom-mirror-store';
import { loadPanelRecords, PANEL_RECORDS_KEY, type LoomPanelRecord } from '../lib/loom-panel-records';

type PaletteKey = 'thread' | 'rose' | 'sage' | 'indigo' | 'umber' | 'plum' | 'ochre';

/**
 * One tile as rendered on the Patterns surface. `color` is always a resolved
 * hex string by the time the tile renders so `--tile-color` can be plugged
 * straight into the inline style. The native projection writes hex
 * directly; older / hand-crafted palette-key values are coerced via
 * `PALETTE[key]`.
 */
type SeedPanel = {
  id?: string;
  title: string;
  sub: string;
  color: string;
  big?: boolean;
  glyph?: string;
};

type StoredPanel = Pick<LoomPanelRecord, 'id' | 'docId' | 'title' | 'sub' | 'subtitle' | 'color' | 'big' | 'glyph'>;

// Earth-tone palette (matches V.* in loom-tokens.jsx). Kept inline — each
// tile needs a deterministic band color, and inline styles let us set
// `--tile-color` per tile without bloating globals.css with one rule per
// category.
const PALETTE: Record<PaletteKey, string> = {
  thread: '#9E7C3E',
  rose:   '#8F4646',
  sage:   '#5C6E4E',
  indigo: '#3A477A',
  umber:  '#5C3F2A',
  plum:   '#5E3D5C',
  ochre:  '#A8783E',
};

function isPaletteKey(value: unknown): value is PaletteKey {
  return typeof value === 'string' && value in PALETTE;
}

/**
 * Normalize a `color` field into a hex string. Three shapes ship today:
 *   - palette key ("thread", "rose", …) — resolved via PALETTE
 *   - literal hex ("#9E7C3E") — passed through
 *   - anything else — fallback to PALETTE.thread for parity with legacy
 */
function resolvePanelColor(raw: unknown): string {
  if (isPaletteKey(raw)) return PALETTE[raw];
  if (typeof raw === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(raw)) return raw;
  return PALETTE.thread;
}

function coerceStoredPanels(raw: unknown): SeedPanel[] | null {
  if (!Array.isArray(raw)) return null;
  const out: SeedPanel[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as StoredPanel;
    const title = typeof entry.title === 'string' ? entry.title : null;
    if (!title) continue;
    const sub =
      (typeof entry.sub === 'string' && entry.sub)
      || (typeof entry.subtitle === 'string' && entry.subtitle)
      || '';
    out.push({
      id: typeof entry.id === 'string' ? entry.id : typeof entry.docId === 'string' ? entry.docId : undefined,
      title,
      sub,
      color: resolvePanelColor(entry.color),
      big: Boolean(entry.big),
      glyph: typeof entry.glyph === 'string' ? entry.glyph : undefined,
    });
  }
  return out;
}

// Return `null` only on unreadable / malformed payloads; an empty list is
// a valid "no panels yet" state and must propagate through as `[]`.
async function loadPanels(): Promise<SeedPanel[]> {
  return coerceStoredPanels(await loadPanelRecords()) ?? [];
}

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);
}

export default function PatternsClient() {
  // Start empty on the server; hydrate from the native projection after
  // mount. The SSR render and the first client render therefore match,
  // and the honest empty state is what paints on a fresh install.
  const [panels, setPanels] = useState<SeedPanel[]>([]);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const next = await loadPanels();
      if (!cancelled) setPanels(next);
    };

    void refresh();

    const dispose = subscribeLoomMirror(PANEL_RECORDS_KEY, 'loom-panels-updated', () => {
      void refresh();
    });
    return () => {
      cancelled = true;
      dispose();
    };
  }, []);

  // Map the first 7 panels onto the asymmetric 4x2 grid defined in the
  // habitat spec. Tiles flagged `big` span both rows; the rest occupy a
  // single cell. We cap at 7 because that's what the grid can hold
  // without the layout breaking — surplus panels will need a "more"
  // overflow treatment in a later milestone.
  const placed = useMemo(() => panels.slice(0, 7), [panels]);

  return (
    <div className="loom-patterns">
      <header className="loom-patterns-header">
        <div className="loom-patterns-eyebrow">Patterns · kesi</div>
        <div className="loom-patterns-title-row">
          <h1 className="loom-patterns-title">Patterns.</h1>
          <p className="loom-patterns-subtitle">
            {placed.length === 0
              ? 'No patterns have settled yet.'
              : 'panels ripen. they do not pile up.'}
          </p>
        </div>
      </header>

      {placed.length === 0 ? (
        <div className="loom-empty-state" role="note">
          <div className="loom-empty-state-ornament" aria-hidden="true">── · ──</div>
          <p className="loom-empty-state-copy">
            Patterns form when a thought returns three times across your
            sources. Use ⌘/ on a reading to mark a live note; when a
            pattern is ready, Crystallize settles it here.
          </p>
          <Link href="/sources" className="loom-empty-state-action">
            Open Sources →
          </Link>
        </div>
      ) : (
        <div className="loom-patterns-grid" role="list">
          {placed.map((panel, index) => (
            <PanelTile
              key={panel.id ?? `${slugifyTitle(panel.title)}-${index}`}
              panel={panel}
              focusId={panel.id ?? slugifyTitle(panel.title)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type PanelTileProps = {
  panel: SeedPanel;
  focusId: string;
};

function buildPanelHref(focusId: string): string {
  return `/panel/${encodeURIComponent(focusId)}`;
}

function PanelTile({ panel, focusId }: PanelTileProps) {
  // `panel.color` is already normalized to a hex string by loadPanels;
  // fall back to the default thread color if a malformed payload slipped
  // through.
  const tileColor = panel.color || PALETTE.thread;
  const classes = `loom-panel-tile${panel.big ? ' loom-panel-tile--big' : ''}`;
  return (
    <a
      href={buildPanelHref(focusId)}
      className={classes}
      style={{ ['--tile-color' as unknown as string]: tileColor } as React.CSSProperties}
      role="listitem"
      aria-label={`Panel: ${panel.title.replace(/\n/g, ' ')}`}
    >
      <div className="loom-panel-tile-band" aria-hidden="true" />
      <PanelKesi color={tileColor} />
      <div>
        <div className="loom-panel-tile-eyebrow">
          <span className="loom-panel-tile-diamond" aria-hidden="true" />
          Panel
        </div>
        <div className="loom-panel-tile-title">{panel.title}</div>
      </div>
      <div className="loom-panel-tile-sub">{panel.sub}</div>
    </a>
  );
}

// Mini-kesi weave: 12 vertical threads in the tile's own color over 8
// alternating-dash horizontal lines in ink3. Mirrors the habitat spec's
// PanelKesi component, tuned down to opacity 0.22 overall so it reads
// as a watermark beneath the title.
function PanelKesi({ color }: { color: string }) {
  const ink3 = '#6B6355';
  return (
    <svg className="loom-panel-tile-kesi" viewBox="0 0 160 110" aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => (
        <line
          key={`v-${i}`}
          x1={i * 14}
          y1={0}
          x2={i * 14}
          y2={110}
          stroke={color}
          strokeWidth={0.6}
          opacity={0.7}
        />
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <line
          key={`h-${i}`}
          x1={0}
          y1={i * 14}
          x2={160}
          y2={i * 14}
          stroke={ink3}
          strokeWidth={0.5}
          strokeDasharray={i % 2 === 0 ? '8 6' : '3 5'}
        />
      ))}
    </svg>
  );
}
