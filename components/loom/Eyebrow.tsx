'use client';
import type { ReactNode, CSSProperties } from 'react';

export type EyebrowLevel = 'section' | 'chip' | 'caption';

export interface EyebrowProps {
  level?: EyebrowLevel;
  subtle?: boolean;
  children: ReactNode;
  className?: string;
  as?: 'span' | 'div' | 'p' | 'h2' | 'h3' | 'h4';
}

interface LevelSpec {
  fontSize: string;
  letterSpacing: string;
  fontStyle: 'normal' | 'italic';
  textTransform: 'uppercase' | 'lowercase' | 'none';
  fontVariant: string;
}

const LEVEL_SPEC: Record<EyebrowLevel, LevelSpec> = {
  section: {
    fontSize: 'var(--font-eyebrow)',
    letterSpacing: 'var(--track-eyebrow)',
    fontStyle: 'normal',
    textTransform: 'lowercase',
    fontVariant: 'small-caps',
  },
  chip: {
    fontSize: 'var(--font-eyebrow-chip)',
    letterSpacing: 'var(--track-eyebrow-chip)',
    fontStyle: 'normal',
    textTransform: 'lowercase',
    fontVariant: 'small-caps',
  },
  caption: {
    fontSize: 'var(--font-eyebrow-caption)',
    letterSpacing: 'var(--track-eyebrow-caption)',
    fontStyle: 'italic',
    textTransform: 'none',
    fontVariant: 'small-caps',
  },
};

export function Eyebrow({
  level = 'section',
  subtle = false,
  children,
  className,
  as: Tag = 'span',
}: EyebrowProps) {
  const spec = LEVEL_SPEC[level];
  const style: CSSProperties = {
    fontFamily: 'var(--serif)',
    fontWeight: 500,
    fontSize: spec.fontSize,
    fontStyle: spec.fontStyle,
    letterSpacing: spec.letterSpacing,
    textTransform: spec.textTransform,
    fontVariant: spec.fontVariant,
    color: subtle ? 'var(--ink-3)' : 'var(--thread)',
    lineHeight: 1,
    display: 'inline-block',
  };
  return (
    <Tag
      className={`loom-eyebrow loom-eyebrow--${level}${className ? ' ' + className : ''}`}
      style={style}
    >
      {children}
    </Tag>
  );
}
