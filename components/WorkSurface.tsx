import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';

type WorkSurfaceTone = 'default' | 'primary' | 'quiet';
type WorkSurfaceDensity = 'compact' | 'regular' | 'roomy';
type WorkActionTone = 'primary' | 'secondary';

const SURFACE_PADDING: Record<WorkSurfaceDensity, string> = {
  compact: '0.95rem 1rem',
  regular: '1.12rem 1.16rem',
  roomy: '1.3rem 1.34rem',
};

export function WorkSurface({
  children,
  tone = 'default',
  density = 'regular',
  style,
}: {
  children: ReactNode;
  tone?: WorkSurfaceTone;
  density?: WorkSurfaceDensity;
  style?: CSSProperties;
}) {
  return (
    <section
      style={{
        ...surfaceStyle(tone, density),
        ...style,
      }}
    >
      {children}
    </section>
  );
}

export function WorkEyebrow({
  children,
  subtle = false,
  style,
}: {
  children: ReactNode;
  subtle?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      className="t-caption2"
      style={{
        color: subtle ? 'var(--muted)' : 'var(--accent)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        fontWeight: 700,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function WorkAction({
  label,
  href,
  onClick,
  tone = 'secondary',
  style,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  tone?: WorkActionTone;
  style?: CSSProperties;
}) {
  const sharedStyle = actionStyle(tone);
  if (href) {
    return (
      <Link href={href} style={{ ...sharedStyle, textDecoration: 'none', ...style }}>
        {label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} style={{ ...sharedStyle, ...style }}>
      {label}
    </button>
  );
}

export function WorkTextAction({
  label,
  href,
  onClick,
  emphasis = false,
  style,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  emphasis?: boolean;
  style?: CSSProperties;
}) {
  const sharedStyle = textActionStyle(emphasis);
  if (href) {
    return (
      <Link href={href} style={{ ...sharedStyle, textDecoration: 'none', ...style }}>
        {label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} style={{ ...sharedStyle, ...style }}>
      {label}
    </button>
  );
}

export function surfaceStyle(tone: WorkSurfaceTone, density: WorkSurfaceDensity): CSSProperties {
  const base: CSSProperties = {
    padding: SURFACE_PADDING[density],
    borderRadius: tone === 'primary' ? 'calc(var(--r-4) + 2px)' : 'var(--r-4)',
    border: '0.5px solid color-mix(in srgb, var(--mat-border) 88%, transparent)',
    backdropFilter: 'var(--mat-blur)',
    WebkitBackdropFilter: 'var(--mat-blur)',
  };

  if (tone === 'primary') {
    return {
      ...base,
      background:
        'linear-gradient(180deg, color-mix(in srgb, var(--mat-thick-bg) 88%, white 12%), color-mix(in srgb, var(--mat-reg-bg) 94%, transparent))',
      boxShadow:
        'inset 0 1px 0 rgba(255,255,255,0.45), 0 18px 46px rgba(0,0,0,0.08)',
    };
  }

  if (tone === 'quiet') {
    return {
      ...base,
      background: 'color-mix(in srgb, var(--mat-thin-bg) 90%, transparent)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 10px 28px rgba(0,0,0,0.04)',
    };
  }

  return {
    ...base,
    background: 'color-mix(in srgb, var(--mat-reg-bg) 94%, transparent)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 12px 30px rgba(0,0,0,0.05)',
  };
}

export function actionStyle(tone: WorkActionTone): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    appearance: 'none',
    border:
      tone === 'primary'
        ? '0.5px solid color-mix(in srgb, var(--accent) 22%, var(--mat-border))'
        : '0.5px solid color-mix(in srgb, var(--mat-border) 88%, transparent)',
    background:
      tone === 'primary'
        ? 'color-mix(in srgb, var(--accent-soft) 76%, var(--mat-thick-bg) 24%)'
        : 'color-mix(in srgb, var(--mat-thick-bg) 70%, transparent)',
    color: 'var(--fg)',
    borderRadius: 999,
    padding: '0.52rem 0.9rem',
    fontSize: '0.78rem',
    fontWeight: 700,
    letterSpacing: '-0.01em',
    lineHeight: 1,
    cursor: 'pointer',
    boxShadow: 'none',
    transition: 'all 0.2s var(--ease)',
  };
}

export function textActionStyle(emphasis: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    appearance: 'none',
    border: 0,
    background: 'transparent',
    color: emphasis ? 'var(--fg)' : 'var(--fg-secondary)',
    padding: 0,
    fontSize: '0.72rem',
    fontWeight: 700,
    letterSpacing: '0.04em',
    lineHeight: 1,
    cursor: 'pointer',
    transition: 'opacity 0.18s var(--ease), color 0.18s var(--ease)',
  };
}
