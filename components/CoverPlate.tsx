/**
 * CoverPlate · a framed plate figure below the Cover's title.
 *
 * The mockup (loom-reading.jsx:22-81) shows a two-page spread whose
 * verso renders a PlateMark-framed architectural bridge elevation —
 * example-specific imagery for "The Bridge". Loom's Cover doesn't
 * know what a source is *about*, so we ship a motif that's always
 * thematically correct: warp × weft. The image is the book itself
 * being woven.
 *
 * Composition:
 *   - Outer PlateMark: a half-point hair rectangle inset from the
 *     container, echoing an etching platemark.
 *   - Inner plate: a smaller inset with a second hair line 1px
 *     inside the first, giving the "embossed" double border.
 *   - Figure: six vertical warp threads crossed by three shallow
 *     zigzag wefts in bronze / ochre / sage — the same three inks
 *     the full LoomDiagram uses, so the motif reads as one visual
 *     system across the app.
 *   - "fig. i." italic serif caption below (matches loom-reading.jsx:75).
 */
export default function CoverPlate() {
  const warpCount = 6;
  const warpGap = 32;
  const warpX = (i: number) => 32 + i * warpGap;
  const width = 32 + (warpCount - 1) * warpGap + 32;
  const height = 200;
  const weftYs = [72, 108, 144];
  const weftInks = [
    'var(--accent)',
    'var(--tint-orange, #A8783E)',
    'var(--tint-green, #5C6E4E)',
  ];
  return (
    <figure className="loom-cover-plate" aria-hidden="true">
      <div className="loom-cover-plate-frame">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          {Array.from({ length: warpCount }, (_, i) => (
            <line
              key={`warp-${i}`}
              x1={warpX(i)}
              y1={28}
              x2={warpX(i)}
              y2={height - 28}
              stroke="var(--ink3, #6B6355)"
              strokeWidth={0.6}
              opacity={0.55}
            />
          ))}
          {weftYs.map((y, i) => {
            const pts: string[] = [];
            for (let x = 24; x < width - 24; x += 14) {
              const up = Math.floor((x - 24) / 14) % 2 === 0;
              pts.push(`${x},${y + (up ? -2 : 2)}`);
            }
            return (
              <polyline
                key={`weft-${i}`}
                points={pts.join(' ')}
                fill="none"
                stroke={weftInks[i]}
                strokeWidth={1.1}
                opacity={0.82}
              />
            );
          })}
          {[
            [warpX(0), weftYs[0]],
            [warpX(2), weftYs[0]],
            [warpX(4), weftYs[0]],
            [warpX(1), weftYs[1]],
            [warpX(3), weftYs[1]],
            [warpX(5), weftYs[1]],
            [warpX(2), weftYs[2]],
            [warpX(4), weftYs[2]],
          ].map(([x, y], i) => (
            <g key={`pin-${i}`}>
              <line
                x1={x - 3}
                y1={y - 3}
                x2={x + 3}
                y2={y + 3}
                stroke="var(--fg)"
                strokeWidth={0.9}
              />
              <line
                x1={x - 3}
                y1={y + 3}
                x2={x + 3}
                y2={y - 3}
                stroke="var(--fg)"
                strokeWidth={0.9}
              />
            </g>
          ))}
        </svg>
      </div>
      <figcaption className="loom-cover-plate-caption">
        fig. i.&nbsp;&nbsp;<span className="loom-cover-plate-caption-b">warp &amp; weft, looking north</span>
      </figcaption>
    </figure>
  );
}
