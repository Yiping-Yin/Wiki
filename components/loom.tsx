import type { CSSProperties, ReactNode } from 'react';
import { color, hairline, radius, space } from '../lib/loom-design-system';

type SurfaceTone = 'card' | 'paper' | 'paperUp';
type Padding = 'none' | 'xs' | 'sm' | 'md' | 'lg';
type Gap = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SURFACE_BG: Record<SurfaceTone, string> = {
  card: color.paperCard,
  paper: color.paper,
  paperUp: color.paperUp,
};

const PADDING: Record<Padding, string> = {
  none: '0',
  xs: space.xs,
  sm: space.sm,
  md: space.md,
  lg: space.lg,
};

const GAP: Record<Gap, string> = {
  none: '0',
  xs: space.xs,
  sm: space.sm,
  md: space.md,
  lg: space.lg,
  xl: space.xl,
};

export function Surface({
  children,
  tone = 'card',
  padded = 'md',
  style,
}: {
  children?: ReactNode;
  tone?: SurfaceTone;
  padded?: Padding;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: SURFACE_BG[tone],
        border: hairline,
        borderRadius: radius.md,
        padding: PADDING[padded],
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Stack({
  children,
  gap = 'sm',
  direction = 'column',
  style,
}: {
  children?: ReactNode;
  gap?: Gap;
  direction?: 'row' | 'column';
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: direction,
        gap: GAP[gap],
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function HairlineRule({ style }: { style?: CSSProperties } = {}) {
  return (
    <hr
      style={{
        border: 0,
        borderTop: hairline,
        margin: 0,
        ...style,
      }}
    />
  );
}
