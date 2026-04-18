/**
 * Loom Service Worker.
 *
 * Strategy:
 *  - Static assets (JS / CSS / SVG / fonts / images): stale-while-revalidate
 *  - HTML navigations: network-first, fall back to cached HTML or /offline
 *  - JSON data (search-index, atlas, knowledge/docs/*): network-first, cache fallback
 *  - API requests (/api/*): never touched — always go to network
 *
 * Versioning: bump CACHE_VERSION to evict old caches.
 */

const CACHE_VERSION = 'loom-v2';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const HTML_CACHE    = `${CACHE_VERSION}-html`;
const DATA_CACHE    = `${CACHE_VERSION}-data`;

const PRECACHE_URLS = [
  '/',
  '/offline',
  '/today',
  '/knowledge',
  '/browse',
  '/highlights',
  '/icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {})),
  );
  // Don't skipWaiting() automatically — let the client decide when to activate
  // so we can show the user a "new version available" toast first.
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API or source-proxy routes
  if (url.pathname.startsWith('/api/')) return;

  const isHTML = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  // Static assets: SWR
  if (
    url.pathname.startsWith('/_next/static/') ||
    /\.(?:js|css|svg|png|jpg|jpeg|webp|woff2?|ttf|ico)$/.test(url.pathname)
  ) {
    event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
    return;
  }

  // JSON data files: network-first
  if (/\.json$/.test(url.pathname)) {
    event.respondWith(networkFirst(req, DATA_CACHE));
    return;
  }

  // HTML navigations: network-first with offline fallback
  if (isHTML) {
    event.respondWith(htmlStrategy(req));
    return;
  }
});

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }
}

async function htmlStrategy(req) {
  const cache = await caches.open(HTML_CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    const offline = await cache.match('/offline') ||
                    await caches.match('/offline');
    if (offline) return offline;
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Offline</title>' +
      '<body style="font-family:-apple-system,sans-serif;background:#000;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center"><div><h1 style="font-weight:700;letter-spacing:-0.02em">Offline</h1><p style="opacity:0.6">No cached version of this page.</p></div></body>',
      { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } },
    );
  }
}
