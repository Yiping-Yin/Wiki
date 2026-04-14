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
import { QuietGuideCard } from '../../components/QuietGuideCard';
import { useAllTraces } from '../../lib/trace';

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

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    loadDocs().then(setIndexDocs);
  }, []);

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

  if (!mounted) return null;
  if (filtered.length === 0) return null;

  const focus = filtered[0] ?? null;

  return (
    <div className="prose-notion" style={{ paddingTop: '4.5rem', paddingBottom: '2rem' }}>
      {focus && (
        <QuietGuideCard
          eyebrow="Return to this passage"
          title={focus.title}
          meta={<span>{formatWhen(focus.highlights[0]?.at ?? 0)}</span>}
          mode="inline"
          actions={[
            { label: 'Return to source', href: focus.href, primary: true },
          ]}
        />
      )}

      {filtered.map((d) => (
        <section key={d.docId} style={{ marginBottom: '2rem' }}>
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
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function formatWhen(ts: number) {
  const diff = Date.now() - ts;
  const day = 86_400_000;
  if (diff < day) return 'today';
  if (diff < day * 2) return 'yesterday';
  if (diff < day * 7) return `${Math.floor(diff / day)}d ago`;
  if (diff < day * 30) return `${Math.floor(diff / (day * 7))}w ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
