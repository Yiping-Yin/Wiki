'use client';
/**
 * Service Worker registration + update toast.
 *
 * - In production: registers /sw.js, listens for updatefound, and shows a
 *   small Apple-style toast when a new version is waiting. Click → activates
 *   the new SW and reloads the page.
 * - In development: proactively unregisters any leftover SW so dev hot-reload
 *   isn't poisoned by a stale cache.
 */
import { useEffect, useState } from 'react';

export function SWRegister() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const host = window.location.hostname;
    const isLocalHost = (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.local') ||
      /^192\.168\./.test(host) ||
      /^10\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    );

    if (process.env.NODE_ENV === 'development' || isLocalHost) {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
      if (typeof caches !== 'undefined') {
        caches.keys().then((keys) =>
          Promise.all(
            keys
              .filter((k) => k.startsWith('wiki-') || k.startsWith('loom-'))
              .map((k) => caches.delete(k)),
          ),
        ).catch(() => {});
      }
      return;
    }

    const onLoad = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

        // Already waiting on initial load → show toast immediately
        if (reg.waiting) setWaiting(reg.waiting);

        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              // A new SW is installed and the page is currently controlled by an old one.
              setWaiting(installing);
            }
          });
        });

        // When the new SW takes control, reload so the user sees the new bundle.
        let reloading = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (reloading) return;
          reloading = true;
          window.location.reload();
        });
      } catch { /* ignore */ }
    };

    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad, { once: true });
  }, []);

  const apply = () => {
    if (!waiting) return;
    waiting.postMessage('SKIP_WAITING');
    setWaiting(null);
  };

  if (!waiting) return null;

  return (
    <div
      className="material-thick"
      role="status"
      style={{
        position: 'fixed', bottom: 24, left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 130,
        padding: '0.55rem 0.75rem 0.55rem 1rem',
        borderRadius: 999,
        display: 'flex', alignItems: 'center', gap: 12,
        animation: 'lpFade 0.3s var(--ease)',
      }}
    >
      <span style={{ color: 'var(--accent)', fontSize: '0.95rem' }} className="liquid-spark-idle">✦</span>
      <span className="t-footnote" style={{ color: 'var(--fg)', fontWeight: 600 }}>
        New version available
      </span>
      <button
        onClick={apply}
        className="t-caption"
        style={{
          background: 'var(--accent)', color: '#fff',
          border: 0, borderRadius: 999,
          padding: '5px 12px', cursor: 'pointer',
          fontWeight: 700, fontFamily: 'var(--display)',
          letterSpacing: '-0.005em',
          boxShadow: 'var(--shadow-1)',
        }}
      >Reload</button>
      <button
        onClick={() => setWaiting(null)}
        aria-label="Dismiss"
        style={{
          background: 'transparent', border: 0, cursor: 'pointer',
          color: 'var(--muted)', fontSize: '1.05rem',
          padding: '0 4px',
        }}
      >×</button>
    </div>
  );
}
