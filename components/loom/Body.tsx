'use client';
import type { ReactNode, CSSProperties } from 'react';

export type BodyWeight = 'normal' | 'medium';
export type BodyTone = 'primary' | 'secondary' | 'muted';

export interface BodyProps {
  weight?: BodyWeight;
  tone?: BodyTone;
  children: ReactNode;
  as?: 'p' | 'div' | 'span';
  className?: string;
}

const TONE_COLOR: Record<BodyTone, string> = {
  primary: 'var(--ink-1)',
  secondary: 'var(--ink-2)',
  muted: 'var(--ink-3)',
};

const WEIGHT_VALUE: Record<BodyWeight, number> = {
  normal: 400,
  medium: 500,
};

export function Body({
  weight = 'normal',
  tone = 'primary',
  children,
  as: Tag = 'p',
  className,
}: BodyProps) {
  const style: CSSProperties = {
    fontFamily: 'var(--serif)',
    fontSize: 'var(--font-body)',
    lineHeight: 'var(--lh-body)',
    fontWeight: WEIGHT_VALUE[weight],
    color: TONE_COLOR[tone],
    margin: 0,
    fontFeatureSettings: '"onum" 1, "pnum" 1',
    hangingPunctuation: 'first last',
  };
  return (
    <Tag
      className={`loom-body loom-body--${tone}${className ? ' ' + className : ''}`}
      style={style}
    >
      {children}
    </Tag>
  );
}
