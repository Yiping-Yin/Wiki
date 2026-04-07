import type { ReactNode } from 'react';

export function Callout({ type = 'info', children }: { type?: 'info' | 'warn' | 'tip'; children: ReactNode }) {
  const colors: Record<string, string> = {
    info: '#2563eb',
    warn: '#d97706',
    tip:  '#16a34a',
  };
  const icons: Record<string, string> = { info: 'ℹ️', warn: '⚠️', tip: '💡' };
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
      <span>{icons[type]}</span>
      <div>{children}</div>
    </div>
  );
}
