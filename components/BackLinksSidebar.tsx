'use client';
/**
 * Compact backlinks panel for the right sidebar (Notion / webapp style).
 * Same logic as BackLinks.tsx but minimal vertical layout.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { preloadWikilinks, resolveWikilinkClient } from '../lib/wikilinks-client';

type Hit = { sourceId: string; sourceTitle: string; sourceHref: string };

export function BackLinksSidebar({ id, title }: { id: string; title: string }) {
  const [hits, setHits] = useState<Hit[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await preloadWikilinks();
      const me = await resolveWikilinkClient(title);
      const currentHref = me?.href ?? '';
      const out: Hit[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith('wiki:notes:') || k === 'wiki:notes:index') continue;
        const sourceId = k.slice('wiki:notes:'.length);
        if (sourceId === id) continue;
        const body = localStorage.getItem(k) ?? '';
        if (!body) continue;
        const tokens = Array.from(body.matchAll(/\[\[([^\]]+?)\]\]/g)).map((m) => m[1]);
        for (const t of tokens) {
          const r = await resolveWikilinkClient(t);
          if (r && (r.href === currentHref || r.title.toLowerCase() === title.toLowerCase())) {
            const sourceMeta = await resolveWikilinkClient(sourceId.replace(/^[^/]+\//, ''));
            out.push({
              sourceId,
              sourceTitle: sourceMeta?.title ?? sourceId,
              sourceHref: sourceMeta?.href ?? '#',
            });
            break;
          }
        }
      }
      if (!cancelled) setHits(out);
    })();
    return () => { cancelled = true; };
  }, [id, title]);

  if (hits.length === 0) return null;

  return (
    <div style={{ marginTop: '1rem' }}>
      <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 6, fontWeight: 700 }}>
        ↩ Backlinks
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {hits.slice(0, 6).map((h, i) => (
          <Link
            key={h.sourceId + i}
            href={h.sourceHref}
            style={{
              fontSize: '0.78rem', color: 'var(--muted)', textDecoration: 'none',
              padding: '4px 8px', borderRadius: 4,
              background: 'var(--code-bg)',
              borderLeft: '2px solid var(--border)',
            }}
          >
            🔗 {h.sourceTitle}
          </Link>
        ))}
      </div>
    </div>
  );
}
