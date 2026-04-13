'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export function DevStatusBadge() {
  const pathname = usePathname() ?? '/';
  const [enabled, setEnabled] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [lastError, setLastError] = useState('');

  useEffect(() => {
    const host = window.location.hostname;
    const onLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    const inAppShell = Boolean((window as any).__loomAppShell);
    setEnabled(onLocal && !inAppShell);
    setHydrated(true);

    const onError = (event: ErrorEvent) => {
      setLastError(event.message || 'window error');
    };
    const onReject = (event: PromiseRejectionEvent) => {
      const reason = typeof event.reason === 'string'
        ? event.reason
        : event.reason?.message ?? 'unhandled rejection';
      setLastError(reason);
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onReject);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onReject);
    };
  }, []);

  if (!enabled) return null;

  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 160,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        maxWidth: 360,
        padding: '8px 10px',
        borderRadius: 12,
        background: 'rgba(0,0,0,0.72)',
        color: '#fff',
        fontSize: '11px',
        lineHeight: 1.35,
        fontFamily: 'var(--mono)',
        boxShadow: 'var(--shadow-3)',
        pointerEvents: 'none',
      }}
    >
      <div>dev: localhost</div>
      <div>hydrated: {hydrated ? 'yes' : 'no'}</div>
      <div>path: {pathname}</div>
      {lastError ? <div style={{ color: '#ffb4b4' }}>error: {lastError}</div> : null}
    </div>
  );
}
