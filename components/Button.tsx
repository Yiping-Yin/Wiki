'use client';
/**
 * Button · canonical action primitive.
 *
 * Three tones — primary / secondary / ghost — and three sizes — sm / md / lg —
 * aligned with Linear / Vercel / Radix. Every actionable surface in Loom
 * should flow through this primitive; inline-styled buttons are on their way
 * out.
 *
 * Rules:
 *  - Primary = only ONE per surface (the expected next move).
 *  - Secondary = reversible / secondary affordance. Outlined.
 *  - Ghost = tertiary / navigational / destructive-subtle. Link-like.
 *
 * Destructive is a modifier on any tone (`destructive` prop flips color to
 * tint-red) rather than a fourth tone — matches Apple HIG / Notion.
 */

import Link from 'next/link';
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

export type ButtonTone = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

type BaseProps = {
  tone?: ButtonTone;
  size?: ButtonSize;
  destructive?: boolean;
  busy?: boolean;
  iconBefore?: ReactNode;
  iconAfter?: ReactNode;
  fullWidth?: boolean;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
};

type ButtonAsButton = BaseProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof BaseProps> & {
  href?: never;
};

type ButtonAsLink = BaseProps & {
  href: string;
  onClick?: () => void;
  target?: string;
  rel?: string;
  disabled?: boolean;
  type?: never;
};

type Props = ButtonAsButton | ButtonAsLink;

const PADDING_BY_SIZE: Record<ButtonSize, string> = {
  sm: '4px 10px',
  md: '6px 14px',
  lg: '10px 18px',
};

const FONT_BY_SIZE: Record<ButtonSize, string> = {
  sm: 'var(--fs-caption)',
  md: 'var(--fs-small)',
  lg: 'var(--fs-body)',
};

const HEIGHT_BY_SIZE: Record<ButtonSize, string> = {
  sm: '24px',
  md: '30px',
  lg: '38px',
};

function toneStyle(tone: ButtonTone, destructive: boolean): CSSProperties {
  const accent = destructive ? 'var(--tint-red)' : 'var(--accent)';

  if (tone === 'primary') {
    return {
      background: destructive ? 'var(--tint-red)' : 'var(--accent)',
      color: 'var(--bg)',
      border: 0,
    };
  }
  if (tone === 'secondary') {
    return {
      background: 'transparent',
      color: destructive ? 'var(--tint-red)' : 'var(--fg)',
      border: `0.5px solid color-mix(in srgb, ${accent} 40%, var(--mat-border))`,
    };
  }
  // ghost
  return {
    background: 'transparent',
    color: destructive ? 'var(--tint-red)' : 'var(--fg-secondary)',
    border: 0,
  };
}

export function Button(props: Props) {
  const {
    tone = 'secondary',
    size = 'md',
    destructive = false,
    busy = false,
    iconBefore,
    iconAfter,
    fullWidth = false,
    children,
    style,
    className,
  } = props;

  const disabled = 'disabled' in props ? Boolean(props.disabled) : false;
  const baseStyle: CSSProperties = {
    display: fullWidth ? 'flex' : 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: PADDING_BY_SIZE[size],
    minHeight: HEIGHT_BY_SIZE[size],
    fontFamily: 'var(--display)',
    fontSize: FONT_BY_SIZE[size],
    fontWeight: tone === 'primary' ? 600 : 500,
    lineHeight: 'var(--lh-tight)',
    borderRadius: 999,
    cursor: disabled ? 'not-allowed' : busy ? 'wait' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'background var(--dur-1) var(--ease), color var(--dur-1) var(--ease), border-color var(--dur-1) var(--ease)',
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    ...toneStyle(tone, destructive),
    ...style,
  };

  const body = (
    <>
      {iconBefore ? <span aria-hidden>{iconBefore}</span> : null}
      <span>{children}</span>
      {iconAfter ? <span aria-hidden>{iconAfter}</span> : null}
    </>
  );

  if ('href' in props && props.href) {
    if (disabled) {
      return (
        <span aria-disabled="true" className={className} style={baseStyle}>
          {body}
        </span>
      );
    }
    return (
      <Link
        href={props.href}
        onClick={props.onClick}
        target={props.target}
        rel={props.rel}
        className={className}
        style={baseStyle}
      >
        {body}
      </Link>
    );
  }

  const {
    tone: _tone,
    size: _size,
    destructive: _destructive,
    busy: _busy,
    iconBefore: _ib,
    iconAfter: _ia,
    fullWidth: _fw,
    children: _children,
    style: _style,
    className: _className,
    disabled: _disabled,
    ...buttonProps
  } = props as ButtonAsButton;

  return (
    <button
      type={buttonProps.type ?? 'button'}
      disabled={disabled || busy}
      className={className}
      style={baseStyle}
      {...buttonProps}
    >
      {body}
    </button>
  );
}
