'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

type QuietGuideAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  primary?: boolean;
};

export function QuietGuideCard({
  eyebrow,
  title,
  meta,
  summary,
  detail,
  actions,
}: {
  eyebrow: string;
  title: string;
  meta?: ReactNode;
  summary?: ReactNode;
  detail?: ReactNode;
  actions?: QuietGuideAction[];
}) {
  return (
    <section
      style={{
        padding: '0.1rem 0 0.8rem',
        marginBottom: 20,
        borderBottom: '0.5px solid var(--mat-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span aria-hidden style={{ width: 14, height: 1, background: 'var(--accent)', opacity: 0.65 }} />
        <span
          className="t-caption2"
          style={{
            color: 'var(--muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontWeight: 700,
          }}
        >
          {eyebrow}
        </span>
        <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div
            style={{
              fontFamily: 'var(--display)',
              fontSize: '1.18rem',
              fontWeight: 650,
              letterSpacing: '-0.02em',
              lineHeight: 1.25,
              marginBottom: meta || summary ? 6 : 0,
            }}
          >
            {title}
          </div>

          {meta ? (
            <div
              className="t-caption2"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
                color: 'var(--muted)',
                letterSpacing: '0.04em',
                marginBottom: summary || detail ? 8 : 0,
              }}
            >
              {meta}
            </div>
          ) : null}

          {summary ? (
            <div
              style={{
                color: 'var(--fg-secondary)',
                fontSize: '0.9rem',
                lineHeight: 1.55,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                marginBottom: detail ? 8 : 0,
              }}
            >
              {summary}
            </div>
          ) : null}

          {detail}
        </div>

        {actions && actions.length > 0 ? (
          <div style={{ display: 'flex', gap: 10, flexShrink: 0, alignSelf: 'center', flexWrap: 'wrap' }}>
            {actions.map((action) => {
              const style = quietGuideActionStyle(Boolean(action.primary));
              if (action.href) {
                return (
                  <Link key={action.label} href={action.href} style={{ ...style, textDecoration: 'none' }}>
                    {action.label}
                  </Link>
                );
              }
              return (
                <button key={action.label} type="button" onClick={action.onClick} style={style}>
                  {action.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function quietGuideActionStyle(primary: boolean) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    appearance: 'none' as const,
    border: 0,
    borderBottom: `0.5px solid ${primary ? 'var(--accent)' : 'var(--mat-border)'}`,
    background: 'transparent',
    color: primary ? 'var(--accent)' : 'var(--fg-secondary)',
    borderRadius: 999,
    padding: '0.3rem 0',
    fontSize: '0.82rem',
    fontWeight: 650,
    letterSpacing: '-0.01em',
    lineHeight: 1,
    cursor: 'pointer',
  };
}
