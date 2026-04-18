'use client';

import type { ReactNode } from 'react';
import { WorkAction, WorkEyebrow, WorkSurface, WorkTextAction } from './WorkSurface';

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
  mode = 'block',
  tone = 'default',
  density = 'regular',
}: {
  eyebrow: string;
  title: string;
  meta?: ReactNode;
  summary?: ReactNode;
  detail?: ReactNode;
  actions?: QuietGuideAction[];
  mode?: 'block' | 'inline';
  tone?: 'default' | 'primary' | 'quiet';
  density?: 'compact' | 'regular' | 'roomy';
}) {
  if (mode === 'inline') {
    return (
      <WorkSurface
        tone={tone === 'default' ? 'quiet' : tone}
        density={density === 'roomy' ? 'regular' : density}
        style={{ marginBottom: 18 }}
      >
        <div
          className="t-caption2"
          style={{
            color: 'var(--muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
            letterSpacing: '0.04em',
          }}
        >
          <WorkEyebrow subtle style={{ letterSpacing: '0.08em' }}>{eyebrow}</WorkEyebrow>
          <span aria-hidden style={{ opacity: 0.4 }}>·</span>
          <span style={{ color: 'var(--fg)', fontWeight: 560 }}>{title}</span>
          {meta ? (
            <>
              <span aria-hidden style={{ opacity: 0.4 }}>·</span>
              {meta}
            </>
          ) : null}
          {actions && actions.length > 0 ? (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {actions.map((action, index) => {
                return (
                  <span key={action.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {index > 0 ? <span aria-hidden style={{ opacity: 0.3 }}>·</span> : null}
                    <WorkTextAction
                      label={action.label}
                      href={action.href}
                      onClick={action.onClick}
                      emphasis={Boolean(action.primary)}
                    />
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>

        {summary ? (
          <div
            style={{
              color: 'var(--fg-secondary)',
              fontSize: '0.83rem',
              lineHeight: 1.5,
              marginTop: 5,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {summary}
          </div>
        ) : null}

        {detail}
      </WorkSurface>
    );
  }

  return (
    <WorkSurface tone={tone} density={density} style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <WorkEyebrow>{eyebrow}</WorkEyebrow>
        <span aria-hidden style={{ flex: 1, height: 0.5, background: 'var(--mat-border)', opacity: 0.6 }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div
            style={{
              fontFamily: 'var(--display)',
              fontSize: '1.16rem',
              fontWeight: 620,
              letterSpacing: '-0.02em',
              lineHeight: 1.25,
              marginBottom: meta || summary ? 6 : 0,
              color: 'var(--fg)',
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
                fontSize: '0.89rem',
                lineHeight: 1.52,
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
              return (
                <WorkAction
                  key={action.label}
                  label={action.label}
                  href={action.href}
                  onClick={action.onClick}
                  tone={action.primary ? 'primary' : 'secondary'}
                />
              );
            })}
          </div>
        ) : null}
      </div>
    </WorkSurface>
  );
}
