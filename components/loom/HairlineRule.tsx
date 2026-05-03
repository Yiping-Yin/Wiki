'use client';
import type { CSSProperties } from 'react';

export type RuleOrient = 'horiz' | 'vert';
export type RuleSpace = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface RuleProps {
  orient?: RuleOrient;
  space?: RuleSpace;
  className?: string;
}

export function HairlineRule({
  orient = 'horiz',
  space = 'none',
  className,
}: RuleProps) {
  const spacing =
    space === 'none' ? '0' : `var(--space-${space})`;

  if (orient === 'vert') {
    const style: CSSProperties = {
      display: 'inline-block',
      width: 0,
      alignSelf: 'stretch',
      borderLeft: '0.5px solid var(--hair)',
      marginLeft: spacing,
      marginRight: spacing,
    };
    return (
      <span
        role="separator"
        aria-orientation="vertical"
        className={`loom-rule loom-rule--vert${className ? ' ' + className : ''}`}
        style={style}
      />
    );
  }

  const style: CSSProperties = {
    border: 'none',
    borderTop: '0.5px solid var(--hair)',
    marginTop: spacing,
    marginBottom: spacing,
    marginLeft: 0,
    marginRight: 0,
    width: '100%',
    height: 0,
  };
  return (
    <hr
      className={`loom-rule loom-rule--horiz${className ? ' ' + className : ''}`}
      style={style}
    />
  );
}
