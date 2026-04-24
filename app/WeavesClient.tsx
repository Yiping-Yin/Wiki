'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { subscribeLoomMirror } from '../lib/loom-mirror-store';
import { loadPanelRecords, PANEL_RECORDS_KEY, type LoomPanelRecord } from '../lib/loom-panel-records';
import { loadWeaveRecords, WEAVE_RECORDS_KEY, type LoomWeaveRecord } from '../lib/loom-weave-records';

// M7 — Weaves constellation client.
//
// Two render paths:
//   1. When the native panel projection is empty, render the honest
//      empty state — no crystallized panels yet, no constellation to draw.
//   2. When panels exist, derive a night-palette SVG constellation. A
//      requested focus is honored only when it resolves to a real held
//      panel (by panel id or docId); otherwise the densest panel is used
//      as a visual center without claiming that the user focused it.
//
// Edges come from TWO sources, overlaid:
//   a) Implicit citation edges — panels that share a `docId`, drawn as
//      faint bronze hairlines (always on; the layer that was here
//      before explicit weaves existed).
//   b) Explicit weaves — learner-minted `LoomWeave` rows, drawn as a
//      SOLID heavier bronze line with a small italic label showing the
//      relation kind ("supports", "contradicts", "elaborates",
//      "echoes"). Takes visual priority: asserted relations matter
//      more than merely-cited ones.
//
// Data source:
//   - native mode prefers direct `loom://native/panels.json` and
//     `loom://native/weaves.json` reads from SwiftData projections.
//   - plain-browser preview falls back through shared record helpers.
//     Native update events still invalidate the direct fetch path after
//     writes.

type StoredPanel = LoomPanelRecord;

type WeavePanel = {
  id: string;
  title: string;
  sub: string;
  color: string;
  docId: string | null;
  thoughtCount: number;
};

type StoredWeave = LoomWeaveRecord;

type ExplicitWeave = {
  id: string;
  from: string;
  to: string;
  kind: string;
  rationale: string;
};

type PaletteKey = 'thread' | 'rose' | 'sage' | 'indigo' | 'umber' | 'plum' | 'ochre';

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

function resolvePanelColor(raw: unknown): string {
  if (isPaletteKey(raw)) return PALETTE[raw];
  if (typeof raw === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(raw)) return raw;
  return PALETTE.thread;
}

function coercePanels(raw: unknown): WeavePanel[] {
  if (!Array.isArray(raw)) return [];
  const out: WeavePanel[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as StoredPanel;
    const title = typeof entry.title === 'string' ? entry.title : null;
    if (!title) continue;
    const id = typeof entry.id === 'string' ? entry.id : `w-${out.length}`;
    const sub =
      (typeof entry.sub === 'string' && entry.sub)
      || (typeof entry.subtitle === 'string' && entry.subtitle)
      || '';
    const docId = typeof entry.docId === 'string' && entry.docId ? entry.docId : null;
    const thoughts = Array.isArray(entry.thoughts) ? entry.thoughts : [];
    out.push({
      id,
      title,
      sub,
      color: resolvePanelColor(entry.color),
      docId,
      thoughtCount: thoughts.length,
    });
  }
  return out;
}

function coerceWeaves(raw: unknown): ExplicitWeave[] {
  if (!Array.isArray(raw)) return [];
  const out: ExplicitWeave[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as StoredWeave;
    const id = typeof entry.id === 'string' ? entry.id : null;
    const from = typeof entry.from === 'string' ? entry.from : null;
    const to = typeof entry.to === 'string' ? entry.to : null;
    if (!id || !from || !to) continue;
    const kind = typeof entry.kind === 'string' ? entry.kind : 'supports';
    const rationale = typeof entry.rationale === 'string' ? entry.rationale : '';
    out.push({ id, from, to, kind, rationale });
  }
  return out;
}

async function loadPanels(): Promise<WeavePanel[]> {
  return coercePanels(await loadPanelRecords());
}

async function loadWeaves(): Promise<ExplicitWeave[]> {
  return coerceWeaves(await loadWeaveRecords());
}

// Deterministic string hash — FNV-1a 32-bit. Used to give each panel a
// stable angular offset on the orbit ring so that rerenders don't
// reshuffle positions.
function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

type PositionedPanel = WeavePanel & { cx: number; cy: number; isFocus: boolean };

function findPanelForFocusTarget(
  panels: WeavePanel[],
  focusTarget: string | null,
): WeavePanel | null {
  if (!focusTarget) return null;
  return panels.find((panel) => panel.id === focusTarget || panel.docId === focusTarget) ?? null;
}

// Place the focus panel at the center; the rest on a ring whose radius
// grows with panel count. Each panel's angular slot is seeded by its id
// hash so positions are stable across renders.
function layoutPanels(
  panels: WeavePanel[],
  viewW: number,
  viewH: number,
  focusId: string | null,
): PositionedPanel[] {
  if (panels.length === 0) return [];
  const cx = viewW / 2;
  const cy = viewH / 2;
  const sorted = [...panels].sort((a, b) => {
    if (b.thoughtCount !== a.thoughtCount) return b.thoughtCount - a.thoughtCount;
    return hashString(a.id) - hashString(b.id);
  });
  const focus = (focusId ? sorted.find((panel) => panel.id === focusId) : null) ?? sorted[0];
  const rest = sorted.filter((panel) => panel.id !== focus.id);
  const out: PositionedPanel[] = [{ ...focus, cx, cy, isFocus: true }];
  if (rest.length === 0) return out;
  const radius = Math.min(viewW, viewH) * (rest.length <= 4 ? 0.3 : 0.36);
  // Give every orbit panel a slot index plus a tiny hash-derived jitter
  // so equidistant siblings don't stack exactly on the compass points.
  const slotCount = rest.length;
  rest.forEach((panel, i) => {
    const jitter = ((hashString(panel.id) % 1000) / 1000 - 0.5) * 0.18; // ±0.09 rad
    const theta = (i / slotCount) * Math.PI * 2 - Math.PI / 2 + jitter;
    out.push({
      ...panel,
      cx: cx + Math.cos(theta) * radius,
      cy: cy + Math.sin(theta) * radius,
      isFocus: false,
    });
  });
  return out;
}

type CitationEdge = { a: PositionedPanel; b: PositionedPanel };

// Solid-but-faint bronze edges between any two panels sharing a docId.
// These are "implicit" relations — the data says the panels cited the
// same source, but the learner hasn't asserted anything explicit about
// how they relate. Explicit weaves override this layer where they exist.
function buildCitationEdges(positioned: PositionedPanel[]): CitationEdge[] {
  const edges: CitationEdge[] = [];
  for (let i = 0; i < positioned.length; i++) {
    for (let j = i + 1; j < positioned.length; j++) {
      const a = positioned[i];
      const b = positioned[j];
      if (!a.docId || !b.docId) continue;
      if (a.docId === b.docId) edges.push({ a, b });
    }
  }
  return edges;
}

type ExplicitEdge = {
  id: string;
  a: PositionedPanel;
  b: PositionedPanel;
  kind: string;
};

// Explicit weaves: filter down to pairs where both endpoints are
// currently on-screen (positioned), so we don't render dangling lines
// for weaves whose panels were deleted or filtered out.
function buildExplicitEdges(
  positioned: PositionedPanel[],
  weaves: ExplicitWeave[],
): ExplicitEdge[] {
  if (weaves.length === 0) return [];
  const byId = new Map<string, PositionedPanel>();
  for (const p of positioned) byId.set(p.id, p);
  const out: ExplicitEdge[] = [];
  for (const w of weaves) {
    const a = byId.get(w.from);
    const b = byId.get(w.to);
    if (!a || !b) continue;
    if (a.id === b.id) continue;
    out.push({ id: w.id, a, b, kind: w.kind });
  }
  return out;
}

// Suppress the implicit (shared-docId) line between two panels when an
// explicit weave already connects them — asserted relations carry the
// information, a ghost citation hairline on the same pair would just
// muddy the image.
function filterCitationsByExplicit(
  citations: CitationEdge[],
  explicit: ExplicitEdge[],
): CitationEdge[] {
  if (explicit.length === 0) return citations;
  const key = (a: string, b: string) => (a < b ? `${a}→${b}` : `${b}→${a}`);
  const overlay = new Set<string>();
  for (const e of explicit) overlay.add(key(e.a.id, e.b.id));
  return citations.filter((c) => !overlay.has(key(c.a.id, c.b.id)));
}

export function WeavesClient() {
  const [panels, setPanels] = useState<WeavePanel[]>([]);
  const [weaves, setWeaves] = useState<ExplicitWeave[]>([]);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const [focusWeaveId, setFocusWeaveId] = useState<string | null>(null);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    setFocusTarget(search.get('focus'));
    setFocusWeaveId(search.get('weaveId'));
    let cancelled = false;

    const refreshPanels = async () => {
      const next = await loadPanels();
      if (!cancelled) setPanels(next);
    };
    const refreshWeaves = async () => {
      const next = await loadWeaves();
      if (!cancelled) setWeaves(next);
    };

    void refreshPanels();
    void refreshWeaves();

    const disposePanels = subscribeLoomMirror(PANEL_RECORDS_KEY, 'loom-panels-updated', () => {
      void refreshPanels();
    });
    const disposeWeaves = subscribeLoomMirror(WEAVE_RECORDS_KEY, 'loom-weaves-updated', () => {
      void refreshWeaves();
    });
    return () => {
      cancelled = true;
      disposePanels();
      disposeWeaves();
    };
  }, []);

  const requestedFocusTarget = useMemo(() => {
    if (focusTarget) return focusTarget;
    if (!focusWeaveId) return null;
    const focusWeave = weaves.find((weave) => weave.id === focusWeaveId);
    return focusWeave?.from ?? null;
  }, [focusTarget, focusWeaveId, weaves]);
  const requestedFocusPanel = useMemo(
    () => findPanelForFocusTarget(panels, requestedFocusTarget),
    [panels, requestedFocusTarget],
  );
  const requestedFocusResolved = requestedFocusTarget !== null && requestedFocusPanel !== null;
  const requestedFocusMissing = requestedFocusTarget !== null && requestedFocusPanel === null;

  const positioned = useMemo(
    () => layoutPanels(panels, 1000, 620, requestedFocusPanel?.id ?? null),
    [panels, requestedFocusPanel],
  );
  const citationEdges = useMemo(() => buildCitationEdges(positioned), [positioned]);
  const explicitEdges = useMemo(
    () => buildExplicitEdges(positioned, weaves),
    [positioned, weaves],
  );
  const visibleCitationEdges = useMemo(
    () => filterCitationsByExplicit(citationEdges, explicitEdges),
    [citationEdges, explicitEdges],
  );

  if (panels.length === 0) {
    return (
      <div className="loom-weaves">
        <header className="loom-weaves-header">
          <div className="loom-weaves-eyebrow">Weaves · a constellation</div>
          <h1 className="loom-weaves-title">Weaves.</h1>
          <p className="loom-weaves-subtitle">The constellation isn&apos;t lit yet.</p>
        </header>

        <div className="loom-empty-state" role="note">
          <div className="loom-empty-state-ornament" aria-hidden="true">── · ──</div>
          <p className="loom-empty-state-copy">
            Weaves needs held panels before it can show any real relations.
            Nothing is mirrored here yet.
          </p>
          <Link href="/patterns" className="loom-empty-state-action">
            Patterns →
          </Link>
        </div>
      </div>
    );
  }

  const focus = positioned.find((p) => p.isFocus) ?? positioned[0];
  const sourceCount = new Set(
    panels.map((p) => p.docId).filter((v): v is string => Boolean(v))
  ).size;
  const hasRealEdges = visibleCitationEdges.length > 0 || explicitEdges.length > 0;
  const title = requestedFocusResolved ? focus.title : 'Weaves.';
  const subtitle = requestedFocusMissing
    ? `The requested focus is not currently held. Showing ${panels.length} panel${panels.length === 1 ? '' : 's'} across ${sourceCount} source${sourceCount === 1 ? '' : 's'}.`
    : requestedFocusResolved
      ? `Focused on one held panel within ${panels.length} panel${panels.length === 1 ? '' : 's'} across ${sourceCount} source${sourceCount === 1 ? '' : 's'}.`
      : `Showing ${panels.length} held panel${panels.length === 1 ? '' : 's'} across ${sourceCount} source${sourceCount === 1 ? '' : 's'}.`;

  return (
    <div className="loom-weaves">
      <header className="loom-weaves-header">
        <div className="loom-weaves-eyebrow">Weaves · a constellation</div>
        <h1 className="loom-weaves-title">{title}</h1>
        <p className="loom-weaves-subtitle">{subtitle}</p>
      </header>

      <svg
        className="loom-weaves-svg"
        viewBox="0 0 1000 620"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Constellation of ${panels.length} held panels`}
      >
        <defs>
          {/* Hot basin — bronze glow around the focus panel. The
              thesis gathering mass, in mockup language. */}
          <radialGradient id="loom-weaves-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#C4A468" stopOpacity="0.28" />
            <stop offset="55%" stopColor="#C4A468" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#C4A468" stopOpacity="0" />
          </radialGradient>
          {/* Warm basin — ochre, for a secondary cluster that's still
              engaged but not the hot center. Mockup loom-constellation.jsx:66. */}
          <radialGradient id="loom-weaves-basin-warm" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#D8A168" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#D8A168" stopOpacity="0" />
          </radialGradient>
          {/* Cool basin — indigo, a held-but-cooling thought. */}
          <radialGradient id="loom-weaves-basin-cool" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#7E8CC7" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#7E8CC7" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Three basins per loom-constellation.jsx:76. Warm/cool render
            only when there are enough panels to suggest real gravity
            wells — with 3+ panels the offsets read as ambient weather,
            with fewer they'd look like floating blobs. */}
        {panels.length >= 3 && (
          <>
            <ellipse
              cx={Math.min(900, focus.cx + 330)}
              cy={Math.max(80, focus.cy - 60)}
              rx={170}
              ry={130}
              fill="url(#loom-weaves-basin-warm)"
            />
            <ellipse
              cx={Math.min(900, focus.cx + 300)}
              cy={Math.min(560, focus.cy + 200)}
              rx={190}
              ry={140}
              fill="url(#loom-weaves-basin-cool)"
            />
          </>
        )}

        {/* Hot basin — always under the focus */}
        <circle cx={focus.cx} cy={focus.cy} r={140} fill="url(#loom-weaves-halo)" />

        {/* Isoclines — contour rings on the hot basin, per
            loom-constellation.jsx:83. Four concentric ellipses at
            expanding radii make the focus read as a basin of
            thermodynamic gravity, not just a labeled node. The
            outermost ring is dashed to suggest "weakly attached". */}
        <g fill="none" stroke="#C4A468" strokeWidth={0.4} opacity={0.32}>
          <ellipse cx={focus.cx} cy={focus.cy} rx={70} ry={48} />
          <ellipse cx={focus.cx} cy={focus.cy} rx={120} ry={82} />
          <ellipse cx={focus.cx} cy={focus.cy} rx={180} ry={124} />
          <ellipse cx={focus.cx} cy={focus.cy} rx={240} ry={166} strokeDasharray="1 4" />
        </g>

        {/* Citation edges — faint bronze hairlines, shared docId.
            Long edges (dx² + dy² > 90 000 ≈ 300 units) get an italic
            "shared" midpoint label — mirrors mockup's cross-basin
            "cousins?" bridge annotation (loom-constellation.jsx:99)
            without requiring an edge-type classifier. Short local
            edges stay unlabeled to avoid clutter. */}
        {visibleCitationEdges.map((edge, i) => {
          const dx = edge.b.cx - edge.a.cx;
          const dy = edge.b.cy - edge.a.cy;
          const isBridge = dx * dx + dy * dy > 90_000;
          const mx = (edge.a.cx + edge.b.cx) / 2;
          const my = (edge.a.cy + edge.b.cy) / 2;
          return (
            <g key={`cite-${i}`}>
              <line
                x1={edge.a.cx}
                y1={edge.a.cy}
                x2={edge.b.cx}
                y2={edge.b.cy}
                stroke="#C4A468"
                strokeWidth={0.75}
                strokeOpacity={0.55}
              />
              {isBridge && (
                <text
                  x={mx}
                  y={my - 4}
                  textAnchor="middle"
                  fontFamily="var(--serif)"
                  fontStyle="italic"
                  fontSize={9}
                  fill="#B9AE93"
                  opacity={0.6}
                >
                  shared
                </text>
              )}
            </g>
          );
        })}

        {/* Explicit weaves — solid bronze, heavier stroke, labeled with kind.
            Rendered AFTER the implicit layer so they paint on top of any
            overlapping hairlines. Label lives at the midpoint in tiny
            italic serif so the learner can read the relation at a glance. */}
        {explicitEdges.map((edge) => {
          const mx = (edge.a.cx + edge.b.cx) / 2;
          const my = (edge.a.cy + edge.b.cy) / 2;
          return (
            <g key={`weave-${edge.id}`}>
              <line
                x1={edge.a.cx}
                y1={edge.a.cy}
                x2={edge.b.cx}
                y2={edge.b.cy}
                stroke="#C4A468"
                strokeWidth={1.2}
                strokeOpacity={0.92}
              />
              <text
                x={mx}
                y={my - 4}
                textAnchor="middle"
                fontFamily="var(--display)"
                fontStyle="italic"
                fontSize={10}
                fill="#ECE2C9"
                opacity={0.82}
              >
                {edge.kind}
              </text>
            </g>
          );
        })}

        {/* Nodes */}
        {positioned.map((p) => (
          <g key={p.id}>
            <circle
              cx={p.cx}
              cy={p.cy}
              r={p.isFocus ? 9 : 5.5}
              fill={p.color}
              stroke="#ECE2C9"
              strokeWidth={0.5}
              strokeOpacity={0.35}
            />
            <text
              x={p.cx}
              y={p.cy + (p.isFocus ? 26 : 20)}
              textAnchor="middle"
              fontFamily="var(--display)"
              fontStyle="italic"
              fontSize={p.isFocus ? 14 : 11}
              fill="#ECE2C9"
              opacity={p.isFocus ? 1 : 0.82}
            >
              {p.title.length > 40 ? `${p.title.slice(0, 38)}…` : p.title}
            </text>
          </g>
        ))}
      </svg>

      {/* Temperature gradient legend — matches
          loom-constellation.jsx:34 "temperature · hot → cool" scale.
          Ambient orientation, not interactive. Rose (alive now) → thread →
          ochre → sage → muted (archived). Uses the tint vars so both
          modes render with adequate contrast. */}
      <div className="loom-weaves-temp-legend" aria-hidden="true">
        <div className="loom-weaves-temp-label">temperature · hot → cool</div>
        <div className="loom-weaves-temp-bar" />
        <div className="loom-weaves-temp-stops">
          <span>alive now</span>
          <span>cooling</span>
          <span>archived</span>
        </div>
      </div>

      <div className="loom-weaves-legend">
        <div className="loom-weaves-legend-items">
          <span className="loom-weaves-legend-item">
            <span className="loom-weaves-legend-diamond" aria-hidden="true" />
            {requestedFocusResolved ? 'requested focus' : 'center panel'}
          </span>
          <span className="loom-weaves-legend-item">
            <span className="loom-weaves-legend-circle" aria-hidden="true" />
            held panel
          </span>
          <span className="loom-weaves-legend-item">
            <span className="loom-weaves-legend-solid" aria-hidden="true" />
            shared source
          </span>
          {explicitEdges.length > 0 && (
            <span className="loom-weaves-legend-item">
              <span className="loom-weaves-legend-solid" aria-hidden="true" style={{ opacity: 1 }} />
              explicit weave
            </span>
          )}
        </div>
        <span>{hasRealEdges ? 'weaves.' : 'no mirrored relations yet.'}</span>
      </div>
    </div>
  );
}
