import type { CSSProperties } from 'react';

/**
 * Ornament · typographic flourish between sections.
 *
 * Matches the mockup primitive at loom-tokens.jsx:106-118: two hair
 * rules flanking a small fleuron (filled circle + vesica leaf). Used
 * at chapter ends, salon dividers, and any quiet break where a plain
 * rule would be too bare.
 *
 * `color` inherits the surrounding context — pass `var(--accent)` for
 * bronze, `var(--muted)` for a quieter break.
 */
export default function Ornament({
  color = 'var(--accent)',
  size = 14,
  className,
  style,
}: {
  color?: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size * 3.2}
      height={size}
      viewBox="0 0 80 24"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
      aria-hidden="true"
    >
      <g stroke={color} strokeWidth={0.7} fill="none" opacity={0.8}>
        <path d="M 4 12 L 30 12" />
        <path d="M 50 12 L 76 12" />
        <circle cx={40} cy={12} r={3} fill={color} opacity={0.9} />
        <path
          d="M 34 12 Q 37 6 40 9 Q 43 12 40 15 Q 37 18 34 12 Z"
          fill={color}
          opacity={0.6}
        />
        <path d="M 46 12 Q 43 6 40 9" />
      </g>
    </svg>
  );
}
