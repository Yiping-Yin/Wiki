import type { CSSProperties } from 'react';

/**
 * LoomDiagram · warp × weft weaving visualization.
 *
 * Matches the mockup primitive at loom-work.jsx:586-620. Nine vertical
 * warp lines (the held sources) crossed by three weft rows (the draft's
 * threads of argument) rendered as shallow zigzags — the polyline
 * alternates ±1.5px up/down as it advances, so the eye reads it as
 * woven *over* and *under* the warp, not just painted across.
 *
 * Eight × anchors mark where the weft pins down — not decorative, they
 * sit on a ripple of pick-up points. In Atelier the diagram is quiet
 * (floats in the sidebar rail), so it stays static; the mockup mixes
 * it into a larger dashboard and doesn't animate either.
 *
 * Dynamic inputs:
 *   - `warpCount`  — one vertical line per held source; defaults to 9
 *   - `weftTones`  — one stroke colour per weft row; defaults to
 *                    [bronze, ochre, sage], matching the mockup's
 *                    thread/ochre/sage inks. Supply fewer for a
 *                    quieter diagram (a single thread reads as "one
 *                    weave in progress"), or more for a denser map.
 */
export default function LoomDiagram({
  warpCount = 9,
  weftTones = ['var(--accent)', 'var(--tint-orange, #A8783E)', 'var(--tint-green, #5C6E4E)'],
  height = 140,
  warpLabels,
  activeWarps,
  onWarpClick,
  className,
  style,
}: {
  warpCount?: number;
  weftTones?: string[];
  height?: number;
  /** One label per warp thread, shown as the thread's hover title. */
  warpLabels?: string[];
  /** Indices of warps to render in accent ink (e.g., sources cited in the
   *  current draft). Unspecified warps render in the muted ink3 default. */
  activeWarps?: number[] | Set<number>;
  /** Click-on-warp handler — makes the SVG a live navigation surface. */
  onWarpClick?: (warpIndex: number) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const activeSet =
    activeWarps instanceof Set
      ? activeWarps
      : new Set(activeWarps ?? []);
  const warpGap = 24;
  const warpX = (i: number) => 14 + i * warpGap;
  const wefts = weftTones.map((tone, i) => ({
    y: 28 + i * 36,
    tone,
  }));
  const anchors = anchorPoints(warpCount, wefts.length).map(([col, row]) => [
    warpX(col),
    wefts[row].y,
  ]);

  const viewWidth = 14 * 2 + (warpCount - 1) * warpGap;

  return (
    <svg
      viewBox={`0 0 ${viewWidth} ${height}`}
      className={className}
      style={{ width: '100%', height, display: 'block', ...style }}
      aria-hidden={onWarpClick ? undefined : true}
      role="img"
    >
      {/* Warp — the held sources, still and vertical. Each warp is a
          clickable hit-target when `onWarpClick` is provided: a 12px
          transparent strip around the visible line lets the user hit
          it without chasing a hairline. The visible stroke stays
          faint so the weft reads as figure on ground. */}
      {Array.from({ length: warpCount }, (_, i) => (
        <g key={`warp-${i}`}>
          <line
            x1={warpX(i)}
            y1={4}
            x2={warpX(i)}
            y2={height - 4}
            stroke={activeSet.has(i) ? 'var(--accent)' : 'var(--ink3, #6B6355)'}
            strokeWidth={activeSet.has(i) ? 0.9 : 0.6}
            opacity={activeSet.has(i) ? 0.85 : 0.55}
          />
          {onWarpClick && (
            <rect
              x={warpX(i) - 6}
              y={0}
              width={12}
              height={height}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onClick={() => onWarpClick(i)}
            >
              {warpLabels?.[i] && <title>{warpLabels[i]}</title>}
            </rect>
          )}
        </g>
      ))}
      {wefts.map(({ y, tone }, i) => (
        <WeftRow key={`weft-${i}`} y={y} color={tone} width={viewWidth} />
      ))}
      {anchors.map(([x, y], i) => (
        <g key={`anchor-${i}`}>
          <line
            x1={x - 2.5}
            y1={y - 2.5}
            x2={x + 2.5}
            y2={y + 2.5}
            stroke="var(--fg)"
            strokeWidth={0.8}
          />
          <line
            x1={x - 2.5}
            y1={y + 2.5}
            x2={x + 2.5}
            y2={y - 2.5}
            stroke="var(--fg)"
            strokeWidth={0.8}
          />
        </g>
      ))}
    </svg>
  );
}

function WeftRow({ y, color, width }: { y: number; color: string; width: number }) {
  const points: string[] = [];
  for (let x = 10; x < width; x += 12) {
    const up = Math.floor(x / 12) % 2 === 0;
    points.push(`${x},${y + (up ? -1.5 : 1.5)}`);
  }
  return (
    <polyline
      points={points.join(' ')}
      fill="none"
      stroke={color}
      strokeWidth={1}
      opacity={0.8}
    />
  );
}

/**
 * Pick-up points — which warp columns each weft anchors at. Static
 * pattern per the mockup; each row visits ~3 anchors and the three
 * rows avoid overlap so the drawing reads as "distinct passes of the
 * shuttle". Deterministic so the diagram is stable across renders.
 */
function anchorPoints(warpCount: number, weftCount: number): [number, number][] {
  const perRow = [
    [0, 2, 6],
    [1, 4, 7],
    [3, 5],
  ];
  const out: [number, number][] = [];
  for (let r = 0; r < Math.min(weftCount, perRow.length); r++) {
    for (const col of perRow[r]) {
      if (col < warpCount) out.push([col, r]);
    }
  }
  return out;
}
