'use client';
/**
 * Service Worker registration.
 *
 * - In production: registers /sw.js quietly.
 * - Updates are picked up on the next full navigation / reload rather than
 *   announced with product-surface chrome.
 * - In development: proactively unregisters any leftover SW so dev hot-reload
 *   isn't poisoned by a stale cache.
 */
import { useEffect } from 'react';

export function SWRegister() {
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
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      } catch { /* ignore */ }
    };

    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad, { once: true });
  }, []);

  return null;
}
