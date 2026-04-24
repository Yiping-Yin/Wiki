'use client';
/**
 * Panel · content container primitive.
 *
 * Side-by-side panels (Materials / Suggest / Reflection / TidyDraft in the
 * cowork detail page, Data / Appearance / AI in Settings) currently each
 * roll their own `borderRadius + border + background + padding`. The
 * variance was never meaningful — just drift.
 *
 * Two tones:
 *   - `plain`  : neutral surface, bg = mat-thick-bg@75, border = mat-border
 *   - `accent` : AI / user-reflection surfaces, bg = accent@4, border = accent@30
 *
 * Density: compact | regular. Compact mirrors sidebar widgets (sparse
 * padding); regular matches hero-ish blocks like Reflection.
 */

import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

export type PanelTone = 'plain' | 'accent';
export type PanelDensity = 'compact' | 'regular';

const PADDING: Record<PanelDensity, string> = {
  compact: '0.8rem 0.9rem',
  regular: '1rem 1.1rem',
};

function toneStyle(tone: PanelTone): CSSProperties {
  if (tone === 'accent') {
    return {
      border: '0.5px solid color-mix(in srgb, var(--accent) 28%, var(--mat-border))',
      background: 'color-mix(in srgb, var(--accent) 4%, var(--mat-thick-bg))',
    };
  }
  return {
    border: '0.5px solid var(--mat-border)',
    background: 'color-mix(in srgb, var(--mat-thick-bg) 75%, transparent)',
  };
}

type PanelProps = HTMLAttributes<HTMLDivElement> & {
  tone?: PanelTone;
  density?: PanelDensity;
  children: ReactNode;
};

export function Panel({
  tone = 'plain',
  density = 'compact',
  children,
  style,
  className,
  ...rest
}: PanelProps) {
  return (
    <div
      {...rest}
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        padding: PADDING[density],
        borderRadius: 'var(--r-3)',
        ...toneStyle(tone),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * PanelEyebrow · consistent section header for panels. Renders as the
 * small uppercased caption + optional right-side meta (like "N items" or a
 * refresh button).
 */
export function PanelEyebrow({
  label,
  tone = 'muted',
  trailing,
}: {
  label: ReactNode;
  tone?: 'muted' | 'accent';
  trailing?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-2)',
      }}
    >
      <span
        className="loom-smallcaps"
        style={{
          color: tone === 'accent' ? 'var(--accent)' : 'var(--muted)',
          fontFamily: 'var(--serif)',
          fontWeight: 500,
          fontSize: '0.84rem',
        }}
      >
        {label}
      </span>
      {trailing}
    </div>
  );
}
