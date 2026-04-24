'use client';

/**
 * SystemAtlasClient — the whole product on one sheet.
 *
 * Three vertical bands (Reader UI · The Loom · Sanctuary) flowing
 * left-to-right. Each band holds five nodes on the same row so an SVG
 * overlay can draw faint quadratic-curve arrows between adjacent
 * nodes without any per-device measurement — the CSS grid places them
 * at known fractional positions, and the SVG uses viewBox coordinates
 * that match.
 *
 * Vellum Phase 7 aesthetic: paper bg, ink text, bronze accent, serif
 * display titles, sans eyebrow labels, clean minimal arrows.
 *
 * Design reference:
 *   /Users/yinyiping/Downloads/Wiki Logo/loom-atlas.jsx → SystemAtlasSurface
 *   /Users/yinyiping/Downloads/Wiki Logo/loom-diagrams.jsx
 */

// Canonical rows: each index lines up Reader-UI[i] ↔ Loom[i] ↔ Sanctuary[i]
// so the flow overlay can use the same row math for every arrow pair. Kept
// in module scope (not inline JSX) because the SVG overlay below iterates
// over rows to draw its curves.
const ROWS = [
  {
    reader: { title: 'Book Room', meta: 'chapter IV · reading' },
    loom: { title: 'Weft engine', meta: 'finds echoes across sources' },
    sanctuary: { title: 'Source vault', meta: 'read-only bookshelf' },
  },
  {
    reader: { title: 'Workbench', meta: 'chapter VII · the desk' },
    loom: { title: 'Panel store', meta: 'what has settled' },
    sanctuary: { title: 'Annotation', meta: 'your hand, preserved' },
  },
  {
    reader: { title: 'Sōan', meta: 'chapter VI · thinking' },
    loom: { title: 'Pattern detector', meta: 'watches for third returns' },
    sanctuary: { title: 'Weft archive', meta: 'every echo found' },
  },
  {
    reader: { title: 'Atlas · Patterns', meta: 'chapter VIII · habitat' },
    loom: { title: 'Diagram graph', meta: 'argument · state · model' },
    sanctuary: { title: 'Panel ledger', meta: 'held findings · dated' },
  },
  {
    reader: { title: 'Shuttle ⌘K', meta: 'navigation' },
    loom: { title: 'AI bridge', meta: 'claude · local CLI fallback' },
    sanctuary: { title: 'Letter outbox', meta: 'correspondence · slow post' },
  },
] as const;

// SVG viewBox dimensions. The flow overlay sits inside the `.bands` grid
// (via position:absolute inset:0) so its coordinate space mirrors the
// grid's: three equal columns, five equal rows. All magic numbers below
// are in this viewBox — changes here do not require CSS edits.
const VB_W = 300;
const VB_H = 500;
const COL_W = VB_W / 3; // 100
const ROW_H = VB_H / ROWS.length; // 100

// Horizontal x-coords for each band's right/left edge. Nodes render with
// a small inner margin so arrows don't disappear under borders.
const READER_RIGHT = COL_W - 4;
const LOOM_LEFT = COL_W + 4;
const LOOM_RIGHT = 2 * COL_W - 4;
const SANCTUARY_LEFT = 2 * COL_W + 4;

export default function SystemAtlasClient() {
  return (
    <article className="loom-system">
      <header className="loom-system-header">
        <div className="eyebrow">ATLAS · OF THE LOOM</div>
        <h1 className="title">The whole product, one sheet</h1>
        <p className="subtitle">
          seven nouns · five verbs · three seasons · four refusals · one discipline
        </p>
      </header>

      <div className="bands">
        <section className="band band-reader">
          <div className="band-label">READER UI</div>
          <div className="band-subtitle">what opens on the desk</div>
          <div className="nodes">
            {ROWS.map((row) => (
              <Node key={row.reader.title} title={row.reader.title} meta={row.reader.meta} />
            ))}
          </div>
        </section>

        <section className="band band-loom">
          <div className="band-label">THE LOOM</div>
          <div className="band-subtitle">engines that never speak unless asked</div>
          <div className="nodes">
            {ROWS.map((row) => (
              <Node key={row.loom.title} title={row.loom.title} meta={row.loom.meta} accent />
            ))}
          </div>
        </section>

        <section className="band band-sanctuary">
          <div className="band-label">SANCTUARY</div>
          <div className="band-subtitle">what the archive never overwrites</div>
          <div className="nodes">
            {ROWS.map((row) => (
              <Node
                key={row.sanctuary.title}
                title={row.sanctuary.title}
                meta={row.sanctuary.meta}
              />
            ))}
          </div>
        </section>

        {/* Flow overlay — faint quadratic curves from reader[i] → loom[i]
            → sanctuary[i]. preserveAspectRatio="none" lets the viewBox
            stretch with the grid so arrows follow the nodes on any
            window size without JS measurement. */}
        <svg
          className="flow"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <marker
              id="loom-system-arrow"
              viewBox="0 0 6 6"
              refX="5"
              refY="3"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
              markerUnits="userSpaceOnUse"
            >
              <path d="M0,0 L6,3 L0,6 z" fill="var(--accent)" opacity="0.55" />
            </marker>
          </defs>
          {ROWS.map((_row, i) => {
            // Row centerline in viewBox y; nodes are vertically centered
            // in each ROW_H slice of the grid.
            const y = ROW_H * (i + 0.5);
            // Quadratic control points bow outward so curves don't
            // collide with the labels/titles on the middle band.
            const cxLeft = (READER_RIGHT + LOOM_LEFT) / 2;
            const cxRight = (LOOM_RIGHT + SANCTUARY_LEFT) / 2;
            const bow = 8; // viewBox units; subtle
            return (
              <g key={i}>
                <path
                  d={`M ${READER_RIGHT} ${y} Q ${cxLeft} ${y - bow} ${LOOM_LEFT} ${y}`}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="0.5"
                  strokeOpacity="0.45"
                  vectorEffect="non-scaling-stroke"
                  markerEnd="url(#loom-system-arrow)"
                />
                <path
                  d={`M ${LOOM_RIGHT} ${y} Q ${cxRight} ${y + bow} ${SANCTUARY_LEFT} ${y}`}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="0.5"
                  strokeOpacity="0.45"
                  vectorEffect="non-scaling-stroke"
                  markerEnd="url(#loom-system-arrow)"
                />
              </g>
            );
          })}
        </svg>
      </div>

      <footer className="loom-system-footer">
        four refusals:{' '}
        <em>no ads. no ranking. no infinite feed. no other person’s attention.</em>
      </footer>
    </article>
  );
}

// ── components ─────────────────────────────────────────────────────────────

type NodeProps = {
  title: string;
  meta: string;
  accent?: boolean;
};

function Node({ title, meta, accent }: NodeProps) {
  return (
    <div className={`loom-system-node${accent ? ' is-accent' : ''}`}>
      <div className="loom-system-node-title">{title}</div>
      <div className="loom-system-node-meta">{meta}</div>
    </div>
  );
}
