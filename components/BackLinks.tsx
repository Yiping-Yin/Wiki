'use client';
/**
 * Scans all wiki:notes:* localStorage entries for [[wikilink]] tokens that
 * resolve to the current document. Renders a "Linked from" panel.
 *
 * Resolution uses the same lazy search-index loader as the renderer.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { preloadWikilinks, resolveWikilinkClient } from '../lib/wikilinks-client';

type Hit = { sourceId: string; sourceTitle: string; sourceHref: string; snippet: string };

export function BackLinks({ id, title }: { id: string; title: string }) {
  const [hits, setHits] = useState<Hit[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await preloadWikilinks();
      // Lazy import to load the search index titles for source resolution
      const out: Hit[] = [];
      const targetHrefs = new Set<string>([
        // Match if the wikilink resolves to either current title or current id-based href
      ]);
      try {
        // figure out current href once
        const me = await resolveWikilinkClient(title);
        const currentHref = me?.href ?? '';

        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k || !k.startsWith('wiki:notes:')) continue;
          if (k === 'wiki:notes:index') continue;
          const sourceId = k.slice('wiki:notes:'.length);
          if (sourceId === id) continue; // ignore self
          const body = localStorage.getItem(k) ?? '';
          if (!body) continue;
          const tokens = Array.from(body.matchAll(/\[\[([^\]]+?)\]\]/g)).map((m) => m[1]);
          if (tokens.length === 0) continue;
          for (const t of tokens) {
            const r = await resolveWikilinkClient(t);
            if (r && (r.href === currentHref || r.title.toLowerCase() === title.toLowerCase())) {
              const sourceMeta = await resolveWikilinkClient(sourceId.replace(/^[^/]+\//, ''));
              out.push({
                sourceId,
                sourceTitle: sourceMeta?.title ?? sourceId,
                sourceHref: sourceMeta?.href ?? '#',
                snippet: extractSnippet(body, t),
              });
              break;
            }
          }
        }
      } catch {}
      if (!cancelled) {
        setHits(out);
        setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [id, title]);

  if (!loaded || hits.length === 0) return null;

  return (
    <div style={{ marginTop: '2rem' }}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.6rem' }}>↩ Linked from {hits.length} note{hits.length === 1 ? '' : 's'}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {hits.map((h, i) => (
          <Link
            key={h.sourceId + i}
            href={h.sourceHref}
            style={{
              border: '1px solid var(--border)', borderRadius: 8,
              padding: '0.6rem 0.9rem', textDecoration: 'none', color: 'var(--fg)',
              display: 'block',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{h.sourceTitle}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>
              … {h.snippet} …
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function extractSnippet(body: string, target: string): string {
  const lc = body.toLowerCase();
  const idx = lc.indexOf('[[' + target.toLowerCase() + ']]');
  if (idx < 0) return body.slice(0, 100);
  const start = Math.max(0, idx - 40);
  const end = Math.min(body.length, idx + target.length + 40);
  return body.slice(start, end).replace(/\n/g, ' ');
}
