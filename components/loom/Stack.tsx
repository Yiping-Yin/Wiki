'use client';
import type { ReactNode, CSSProperties } from 'react';

export type StackGap = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
export type StackAlign = 'start' | 'center' | 'stretch' | 'end';

export interface StackProps {
  gap?: StackGap;
  align?: StackAlign;
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'ul' | 'ol';
}

const ALIGN_VALUE: Record<StackAlign, CSSProperties['alignItems']> = {
  start: 'flex-start',
  center: 'center',
  stretch: 'stretch',
  end: 'flex-end',
};

export function Stack({
  gap = 'md',
  align = 'stretch',
  children,
  className,
  as: Tag = 'div',
}: StackProps) {
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: `var(--space-${gap})`,
    alignItems: ALIGN_VALUE[align],
    margin: 0,
    padding: 0,
    listStyle: Tag === 'ul' || Tag === 'ol' ? 'none' : undefined,
  };
  return (
    <Tag
      className={`loom-stack loom-stack--gap-${gap}${className ? ' ' + className : ''}`}
      style={style}
    >
      {children}
    </Tag>
  );
}
