/**
 * Client-side wikilink resolver. Loads the search index lazily and matches titles.
 */
let _idx: Map<string, { href: string; title: string }> | null = null;
let _loadPromise: Promise<void> | null = null;

async function ensureLoaded() {
  if (_idx) return;
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    try {
      const r = await fetch('/search-index.json');
      if (!r.ok) return;
      const payload = await r.json();
      const stored = payload.index?.storedFields ?? {};
      const docIds = payload.index?.documentIds ?? {};
      const m = new Map<string, { href: string; title: string }>();
      for (const [internal, fields] of Object.entries<any>(stored)) {
        if (!fields?.title || !fields?.href) continue;
        m.set(fields.title.toLowerCase(), { href: fields.href, title: fields.title });
        // also index by raw doc id (e.g. wiki/attention) when present
        const id = docIds[internal];
        if (id) {
          const after = String(id).split('/').pop()?.toLowerCase();
          if (after) m.set(after, { href: fields.href, title: fields.title });
        }
      }
      _idx = m;
    } catch {}
  })();
  return _loadPromise;
}

export async function resolveWikilinkClient(target: string): Promise<{ href: string; title: string } | null> {
  await ensureLoaded();
  if (!_idx) return null;
  const k = target.trim().toLowerCase();
  const hit = _idx.get(k);
  if (hit) return hit;
  if (k.length >= 4) {
    for (const [key, v] of _idx) if (key.includes(k)) return v;
  }
  return null;
}

export function isWikilinkIndexReady() { return !!_idx; }
export async function preloadWikilinks() { return ensureLoaded(); }
