'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { subscribeLoomMirror } from '../lib/loom-mirror-store';
import { loadPanelRecords, PANEL_RECORDS_KEY, type LoomPanelRecord } from '../lib/loom-panel-records';

// M16 — Constellation. Day-mode, basins forming.
//
// When no panels exist, renders the honest empty state. When panels
// exist, groups them by `docId` (null → "orphan" basin). The top 3
// basins by panel count become hot / warm / cool, each an ellipse with
// its panels rendered as small colored circles inside. An italic serif
// label sits at the basin edge.
//
// Data source: native mode fetches `loom://native/panels.json`
// directly from SwiftData. Browser preview falls back to the shared
// mirror helper. Updates propagate via `loom-panels-updated`.

type StoredPanel = LoomPanelRecord;

type BasinPanel = {
  id: string;
  title: string;
  color: string;
  docId: string | null;
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

function coercePanels(raw: unknown): BasinPanel[] {
  if (!Array.isArray(raw)) return [];
  const out: BasinPanel[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as StoredPanel;
    const title = typeof entry.title === 'string' ? entry.title : null;
    if (!title) continue;
    const id = typeof entry.id === 'string' ? entry.id : `c-${out.length}`;
    const docId = typeof entry.docId === 'string' && entry.docId ? entry.docId : null;
    out.push({
      id,
      title,
      color: resolvePanelColor(entry.color),
      docId,
    });
  }
  return out;
}

async function loadPanels(): Promise<BasinPanel[]> {
  return coercePanels(await loadPanelRecords());
}

function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

type Basin = {
  key: string;           // docId or 'orphan'
  panels: BasinPanel[];
  label: string;         // displayed label (derived from first panel's title)
};

type BasinSlot = {
  basin: Basin;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  fill: string;          // svg paint (may reference a <defs> id)
  strokeColor: string;
  labelX: number;
  labelY: number;
  labelAnchor: 'start' | 'middle' | 'end';
  gradientId: string | null;
};

// Hand-placed coords per the spec — hot at center, warm upper-right,
// cool lower-right. Values reference the 1000x620 viewBox.
const SLOT_GEOMETRY: Array<{
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  labelX: number;
  labelY: number;
  labelAnchor: 'start' | 'middle' | 'end';
}> = [
  // hot — centered but slightly left-of-center so warm has room
  { cx: 420, cy: 330, rx: 230, ry: 140, labelX: 420, labelY: 500, labelAnchor: 'middle' },
  // warm — upper-right
  { cx: 760, cy: 170, rx: 160, ry: 95,  labelX: 760, labelY: 290, labelAnchor: 'middle' },
  // cool — lower-right
  { cx: 780, cy: 470, rx: 170, ry: 105, labelX: 780, labelY: 600, labelAnchor: 'middle' },
];

const SLOT_PAINTS: Array<{ fill: string; stroke: string; gradientId: string | null }> = [
  // hot — bronze with a defined radial gradient
  { fill: 'url(#loom-basin-hot)', stroke: '#9E7C3E', gradientId: 'loom-basin-hot' },
  // warm — ochre, solid low-alpha
  { fill: 'rgba(168, 120, 62, 0.16)', stroke: '#A8783E', gradientId: null },
  // cool — indigo, solid low-alpha
  { fill: 'rgba(58, 71, 122, 0.15)', stroke: '#3A477A', gradientId: null },
];

// Place a panel inside its basin ellipse deterministically: hash the id
// to angle + radial fraction so the same panel always lands at the
// same spot. Keeps everything inside the ellipse with a small margin.
function placeInEllipse(
  panelId: string,
  slot: BasinSlot,
  slotIndex: number,
  totalInBasin: number,
): { x: number; y: number } {
  const h = hashString(`${panelId}:${slot.basin.key}`);
  const angle = ((h & 0xffff) / 0xffff) * Math.PI * 2;
  // Spread panels across basin radii — index-based shell with a small hash jitter.
  const shell = totalInBasin === 1 ? 0 : slotIndex / Math.max(totalInBasin - 1, 1);
  const radial = 0.25 + shell * 0.55 + ((h >>> 16) / 0xffff) * 0.1;
  const rx = slot.rx * 0.82;
  const ry = slot.ry * 0.8;
  return {
    x: slot.cx + Math.cos(angle) * rx * radial,
    y: slot.cy + Math.sin(angle) * ry * radial,
  };
}

export function ConstellationClient() {
  const [panels, setPanels] = useState<BasinPanel[]>([]);

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

  const basins = useMemo<Basin[]>(() => {
    const groups = new Map<string, BasinPanel[]>();
    for (const p of panels) {
      const key = p.docId ?? 'orphan';
      const list = groups.get(key);
      if (list) list.push(p);
      else groups.set(key, [p]);
    }
    const arr: Basin[] = [];
    for (const [key, ps] of groups) {
      // Label: use the most common title inside the basin (first panel's
      // title is a reasonable proxy since shared docId implies same
      // sourceTitle on the Swift side).
      const label = ps[0]?.title ?? (key === 'orphan' ? 'Unsourced' : 'Source');
      arr.push({ key, panels: ps, label });
    }
    // Hot → warm → cool by panel count; ties broken deterministically
    // by key hash so the same data always yields the same order.
    arr.sort((a, b) => {
      if (b.panels.length !== a.panels.length) return b.panels.length - a.panels.length;
      return hashString(a.key) - hashString(b.key);
    });
    return arr.slice(0, 3);
  }, [panels]);

  if (panels.length === 0) {
    return (
      <div className="loom-constellation">
        <header className="loom-constellation-header">
          <div className="loom-constellation-eyebrow">Constellation · day</div>
          <h1 className="loom-constellation-title">Constellation.</h1>
          <p className="loom-constellation-subtitle">No basins have formed yet.</p>
        </header>

        <div className="loom-empty-state" role="note">
          <div className="loom-empty-state-ornament" aria-hidden="true">── · ──</div>
          <p className="loom-empty-state-copy">
            Basins appear when the weaving engine notices related thoughts
            clustering. Open several sources and start weaving; the
            constellation begins to form of its own.
          </p>
          <Link href="/sources" className="loom-empty-state-action">
            Open Sources →
          </Link>
        </div>
      </div>
    );
  }

  const slots: BasinSlot[] = basins.map((basin, i) => {
    const geom = SLOT_GEOMETRY[i];
    const paint = SLOT_PAINTS[i];
    return {
      basin,
      cx: geom.cx,
      cy: geom.cy,
      rx: geom.rx,
      ry: geom.ry,
      fill: paint.fill,
      strokeColor: paint.stroke,
      labelX: geom.labelX,
      labelY: geom.labelY,
      labelAnchor: geom.labelAnchor,
      gradientId: paint.gradientId,
    };
  });

  const totalPanelsInBasins = slots.reduce((acc, s) => acc + s.basin.panels.length, 0);

  return (
    <div className="loom-constellation">
      <header className="loom-constellation-header">
        <div className="loom-constellation-eyebrow">Constellation · basins forming</div>
        <h1 className="loom-constellation-title">Your sources are clustering.</h1>
        <p className="loom-constellation-subtitle">
          {slots.length} basin{slots.length === 1 ? '' : 's'} · {totalPanelsInBasins} panel{totalPanelsInBasins === 1 ? '' : 's'} held across them.
        </p>
      </header>

      <svg
        className="loom-constellation-svg"
        viewBox="0 0 1000 620"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Constellation of ${slots.length} basins holding ${totalPanelsInBasins} panels`}
      >
        <defs>
          <radialGradient id="loom-basin-hot" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#9E7C3E" stopOpacity="0.32" />
            <stop offset="65%" stopColor="#9E7C3E" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#9E7C3E" stopOpacity="0.04" />
          </radialGradient>
        </defs>

        {slots.map((slot) => (
          <g key={slot.basin.key}>
            <ellipse
              cx={slot.cx}
              cy={slot.cy}
              rx={slot.rx}
              ry={slot.ry}
              fill={slot.fill}
              stroke={slot.strokeColor}
              strokeOpacity={0.4}
              strokeWidth={0.75}
            />

            {slot.basin.panels.map((panel, j) => {
              const pos = placeInEllipse(panel.id, slot, j, slot.basin.panels.length);
              return (
                <circle
                  key={panel.id}
                  cx={pos.x}
                  cy={pos.y}
                  r={3.5}
                  fill={panel.color}
                  stroke="var(--bg)"
                  strokeWidth={0.5}
                />
              );
            })}

            <text
              x={slot.labelX}
              y={slot.labelY}
              textAnchor={slot.labelAnchor}
              className="loom-constellation-node-label"
            >
              {slot.basin.label.length > 40
                ? `${slot.basin.label.slice(0, 38)}…`
                : slot.basin.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
