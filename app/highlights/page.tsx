'use client';
/**
 * /highlights — every line you have flagged across Loom, grouped by source.
 *
 * §1, §11 — the previous version had PageHero with eyebrow + title + stats
 * + descriptive copy, gradient card headers per group, filter pill row,
 * and a remove "×" button on every row. All chrome. The new version is
 * pure typography: doc title as a small accent label, highlights as a
 * left-bordered list, hairline dividers. Removal is no longer a per-row
 * affordance — that decision belongs at the source page where the highlight
 * was made (selection menu), not in a clipping inventory.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAllTraces, useRemoveEvents } from '../../lib/trace';

type Hl = { text: string; tint: string; at: number };
type DocHls = {
  docId: string;
  href: string;
  title: string;
  highlights: Hl[];
};

type IndexDoc = { id: string; title: string; href: string; category: string };

let _idxCache: IndexDoc[] | null = null;
async function loadDocs(): Promise<IndexDoc[]> {
  if (_idxCache) return _idxCache;
  try {
    const r = await fetch('/api/search-index');
    if (!r.ok) return [];
    const payload = await r.json();
    const stored = payload.index?.storedFields ?? {};
    const docIds = payload.index?.documentIds ?? {};
    const out: IndexDoc[] = [];
    for (const [internal, fields] of Object.entries<any>(stored)) {
      if (!fields?.title || !fields?.href) continue;
      out.push({
        id: String(docIds[internal] ?? internal),
        title: fields.title,
        href: fields.href,
        category: fields.category ?? '',
      });
    }
    _idxCache = out;
    return out;
  } catch { return []; }
}

function inferHrefFromId(id: string): string {
  const w = id.match(/^wiki\/(.+)$/);
  if (w) return `/wiki/${w[1]}`;
  const k = id.match(/^know\/([^_]+(?:_[^_]+)*)__(.+)$/);
  if (k) return `/knowledge/${k[1]}/${k[2]}`;
  return '#';
}

export default function HighlightsPage() {
  const [mounted, setMounted] = useState(false);
  const [indexDocs, setIndexDocs] = useState<IndexDoc[]>([]);
  const { traces } = useAllTraces();
  const removeEvents = useRemoveEvents();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    loadDocs().then(setIndexDocs);
  }, []);

  const filtered = useMemo(() => {
    const byId = new Map<string, IndexDoc>();
    for (const d of indexDocs) byId.set(d.id, d);
    const out: (DocHls & { traceId: string })[] = [];
    for (const t of traces) {
      if (t.kind !== 'reading' || t.parentId || !t.source?.docId) continue;
      const highlights = t.events
        .filter((e): e is Extract<typeof e, { kind: 'highlight' }> => e.kind === 'highlight')
        .map((e) => ({ text: e.text, tint: e.tint, at: e.at }))
        .sort((a, b) => b.at - a.at);
      if (highlights.length === 0) continue;
      const meta = byId.get(t.source.docId);
      out.push({
        traceId: t.id,
        docId: t.source.docId,
        href: meta?.href ?? inferHrefFromId(t.source.docId),
        title: meta?.title ?? t.source.sourceTitle ?? t.source.docId,
        highlights,
      });
    }
    out.sort((a, b) => {
      const aMax = Math.max(...a.highlights.map((h) => h.at));
      const bMax = Math.max(...b.highlights.map((h) => h.at));
      return bMax - aMax;
    });
    return out;
  }, [indexDocs, traces]);

  const removeOne = (traceId: string, at: number) => {
    void removeEvents(traceId, (e) => e.kind === 'highlight' && e.at === at);
  };

  if (!mounted) return null;
  if (filtered.length === 0) return null;

  return (
    <div className="prose-notion" style={{ paddingTop: '4.5rem', paddingBottom: '2rem' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 18,
      }}>
        <span aria-hidden style={{
          width: 18, height: 1,
          background: 'var(--accent)', opacity: 0.55,
        }} />
        <span className="t-caption2" style={{
          color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: '0.10em',
          fontWeight: 700,
        }}>Highlights</span>
        <span aria-hidden style={{
          flex: 1, height: 1, background: 'var(--mat-border)',
        }} />
      </div>

      {filtered.map((d) => (
        // §X · Key by traceId, not docId. Two reading traces for the same
        // doc (e.g. legacy data where a new trace got created instead of
        // reusing the existing one) would collide on docId.
        <section key={d.traceId} style={{ marginBottom: '2rem' }}>
          <Link href={d.href} style={{
            display: 'block',
            color: 'var(--accent)',
            textDecoration: 'none',
            fontFamily: 'var(--display)',
            fontSize: '0.92rem',
            fontWeight: 600,
            letterSpacing: '-0.005em',
            marginBottom: 8,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{d.title}</Link>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {d.highlights.map((h, i) => (
              <li key={i} style={{
                display: 'flex', gap: 12,
                padding: '0.55rem 0',
                borderBottom: i < d.highlights.length - 1 ? '0.5px solid var(--mat-border)' : 'none',
              }}>
                <span aria-hidden style={{
                  width: 2, alignSelf: 'stretch',
                  background: h.tint,
                  borderRadius: 999,
                  flexShrink: 0,
                }} />
                <Link href={d.href} style={{
                  margin: 0, flex: 1,
                  color: 'var(--fg)',
                  textDecoration: 'none',
                  fontSize: '0.94rem',
                  lineHeight: 1.6,
                }}>{h.text}</Link>
                <button
                  onClick={() => removeOne(d.traceId, h.at)}
                  aria-label="Remove highlight"
                  style={{
                    background: 'transparent', border: 0, cursor: 'pointer',
                    color: 'var(--muted)', fontSize: '0.9rem', padding: '0 4px',
                    flexShrink: 0, alignSelf: 'flex-start',
                    opacity: 0.4,
                    transition: 'opacity 0.14s, color 0.14s',
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.opacity = '1';
                    el.style.color = 'var(--tint-red)';
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.opacity = '0.4';
                    el.style.color = 'var(--muted)';
                  }}
                >×</button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
