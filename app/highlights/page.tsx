'use client';
/**
 * /highlights — every line you have flagged across Loom, grouped by source.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageFrame } from '../../components/PageFrame';
import { useAllTraces } from '../../lib/trace';
import { fetchSearchIndex } from '../../lib/search-index-client';

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
    const r = await fetchSearchIndex();
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

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { loadDocs().then(setIndexDocs); }, []);

  const filtered = useMemo(() => {
    const byId = new Map<string, IndexDoc>();
    for (const d of indexDocs) byId.set(d.id, d);
    const byDoc = new Map<string, DocHls>();
    for (const trace of traces) {
      if (trace.kind !== 'reading' || trace.parentId || !trace.source?.docId) continue;
      const highlights = trace.events
        .filter((e): e is Extract<typeof e, { kind: 'highlight' }> => e.kind === 'highlight')
        .map((e) => ({ text: e.text, tint: e.tint, at: e.at }));
      if (highlights.length === 0) continue;
      const meta = byId.get(trace.source.docId);
      const existing = byDoc.get(trace.source.docId);
      if (existing) {
        existing.highlights.push(...highlights);
        continue;
      }
      byDoc.set(trace.source.docId, {
        docId: trace.source.docId,
        href: meta?.href ?? inferHrefFromId(trace.source.docId),
        title: meta?.title ?? trace.source.sourceTitle ?? trace.source.docId,
        highlights: [...highlights],
      });
    }
    const out = Array.from(byDoc.values()).map((doc) => ({
      ...doc,
      highlights: doc.highlights.sort((a, b) => b.at - a.at),
    }));
    for (const doc of out) {
      const seen = new Set<string>();
      doc.highlights = doc.highlights.filter((highlight) => {
        const key = `${highlight.text}::${highlight.at}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    out.sort((a, b) => {
      const aMax = Math.max(...a.highlights.map((h) => h.at));
      const bMax = Math.max(...b.highlights.map((h) => h.at));
      return bMax - aMax;
    });
    return out;
  }, [indexDocs, traces]);

  return (
    <div className="prose-notion" style={{ paddingTop: '4.5rem', paddingBottom: 'var(--space-7)' }}>
      <PageFrame
        eyebrow="Highlights"
        title="Flagged passages."
        description="Every line you've highlighted, grouped by source."
      >
        {!mounted ? null : filtered.length === 0 ? (
          <div
            style={{
              padding: 'clamp(2rem, 6vh, 4rem) 0',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.9rem',
              alignItems: 'flex-start',
              borderBottom: '0.5px solid var(--mat-border)',
            }}
          >
            <p style={{
              margin: 0,
              fontFamily: 'var(--display)',
              fontStyle: 'italic',
              fontSize: 'clamp(1.1rem, 1.1vw + 0.6rem, 1.4rem)',
              lineHeight: 1.4,
              color: 'var(--fg)',
            }}>
              No lines flagged yet.
            </p>
            <p style={{
              margin: 0,
              fontFamily: 'var(--serif)',
              fontSize: '0.92rem',
              lineHeight: 1.5,
              color: 'var(--fg-secondary)',
              maxWidth: '32em',
            }}>
              Select any passage inside a source and Loom keeps it here — grouped by book, in the order you read.
            </p>
          </div>
        ) : (
          filtered.map((d) => (
            <section key={d.docId} style={{ marginBottom: 'var(--space-7)' }}>
              <Link href={d.href} style={{
                display: 'block',
                color: 'var(--accent)',
                textDecoration: 'none',
                fontFamily: 'var(--display)',
                fontSize: 'var(--fs-body)',
                fontStyle: 'italic',
                fontWeight: 500,
                letterSpacing: '-0.012em',
                marginBottom: 'var(--space-2)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{d.title}</Link>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {d.highlights.map((h, i) => (
                  <li key={i} style={{
                    display: 'flex', gap: 'var(--space-3)',
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
                      fontSize: 'var(--fs-body-lg)',
                      lineHeight: 'var(--lh-relaxed)',
                    }}>{h.text}</Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </PageFrame>
    </div>
  );
}
