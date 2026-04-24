import type { ReactNode } from 'react';

export function Callout({ type = 'info', children }: { type?: 'info' | 'warn' | 'tip'; children: ReactNode }) {
  const colors: Record<string, string> = {
    info: 'var(--tint-blue)',
    warn: 'var(--tint-orange)',
    tip:  'var(--tint-green)',
  };
  const labels: Record<string, string> = {
    info: 'Info',
    warn: 'Warning',
    tip: 'Note',
  };
  return (
    <div style={{
      borderLeft: `3px solid ${colors[type]}`,
      background: 'var(--code-bg)',
      padding: '0.8rem 1rem',
      borderRadius: 6,
      margin: '1rem 0',
      display: 'flex',
      gap: '0.7rem',
    }}>
      <span className="loom-smallcaps" style={{
        flex: '0 0 auto',
        color: colors[type],
        fontFamily: 'var(--serif)',
        fontSize: '0.84rem',
        fontWeight: 500,
        paddingTop: '0.15rem',
      }}>
        {labels[type]}
      </span>
      <div>{children}</div>
    </div>
  );
}
