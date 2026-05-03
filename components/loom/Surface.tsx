'use client';
import type { ReactNode, CSSProperties } from 'react';

export type SurfaceTone = 'card' | 'paper' | 'deep';
export type SurfaceRadius = 'sm' | 'md' | 'lg';
export type SurfacePad = false | true | 'sm' | 'md' | 'lg' | 'xl';

export interface SurfaceProps {
  tone?: SurfaceTone;
  radius?: SurfaceRadius;
  padded?: SurfacePad;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  as?: 'div' | 'section' | 'article' | 'aside';
}

const TONE_BG: Record<SurfaceTone, string> = {
  card: 'var(--paper-card)',
  paper: 'var(--paper-up)',
  deep: 'var(--paper-deep)',
};

export function Surface({
  tone = 'card',
  radius = 'md',
  padded = 'md',
  children,
  className,
  style,
  as: Tag = 'div',
}: SurfaceProps) {
  const padToken: string =
    padded === false
      ? '0'
      : padded === true
        ? 'var(--space-md)'
        : `var(--space-${padded})`;

  const composed: CSSProperties = {
    background: TONE_BG[tone],
    border: '0.5px solid var(--hair)',
    borderRadius: `var(--radius-${radius})`,
    padding: padToken,
    ...style,
  };

  return (
    <Tag
      className={`loom-surface${className ? ' ' + className : ''}`}
      style={composed}
    >
      {children}
    </Tag>
  );
}
