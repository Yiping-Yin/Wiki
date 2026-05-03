'use client';
import type { ReactNode, CSSProperties } from 'react';

export type DisplayLevel = '1' | '2' | '3';

export interface DisplayProps {
  level?: DisplayLevel;
  italic?: boolean;
  children: ReactNode;
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'div';
  className?: string;
}

interface LevelSpec {
  fontSize: string;
  lineHeight: string;
  fontWeight: number;
  defaultItalic: boolean;
  defaultTag: 'h1' | 'h2' | 'h3';
}

const LEVEL_SPEC: Record<DisplayLevel, LevelSpec> = {
  '1': {
    fontSize: 'var(--font-display-1)',
    lineHeight: 'var(--lh-display-1)',
    fontWeight: 400,
    defaultItalic: true,
    defaultTag: 'h1',
  },
  '2': {
    fontSize: 'var(--font-display-2)',
    lineHeight: 'var(--lh-display-2)',
    fontWeight: 500,
    defaultItalic: true,
    defaultTag: 'h2',
  },
  '3': {
    fontSize: 'var(--font-display-3)',
    lineHeight: 'var(--lh-display-3)',
    fontWeight: 500,
    defaultItalic: false,
    defaultTag: 'h3',
  },
};

export function Display({
  level = '1',
  italic,
  children,
  as,
  className,
}: DisplayProps) {
  const spec = LEVEL_SPEC[level];
  const Tag = as ?? spec.defaultTag;
  const isItalic = italic ?? spec.defaultItalic;
  const style: CSSProperties = {
    fontFamily: 'var(--display)',
    fontSize: spec.fontSize,
    lineHeight: spec.lineHeight,
    fontWeight: spec.fontWeight,
    fontStyle: isItalic ? 'italic' : 'normal',
    color: 'var(--ink-1)',
    margin: 0,
    fontFeatureSettings: '"onum" 1, "pnum" 1',
  };
  return (
    <Tag
      className={`loom-display loom-display--${level}${className ? ' ' + className : ''}`}
      style={style}
    >
      {children}
    </Tag>
  );
}
