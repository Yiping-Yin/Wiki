'use client';
/**
 * /quizzes — every quiz attempt, by source.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageFrame } from '../../components/PageFrame';
import { isWeak, useQuizResults } from '../../lib/use-quiz';
import { fetchSearchIndex } from '../../lib/search-index-client';

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
      if (!fields?.href || !fields?.title) continue;
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

function prettifyId(id: string): string {
  return id.replace(/^wiki\//, '').replace(/^.*__/, '').replace(/-/g, ' ');
}

export default function QuizzesPage() {
  const [results] = useQuizResults();
  const [docs, setDocs] = useState<IndexDoc[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); loadDocs().then(setDocs); }, []);

  const docsById = useMemo(() => {
    const m = new Map<string, IndexDoc>();
    for (const d of docs) m.set(d.id, d);
    return m;
  }, [docs]);

  const items = useMemo(() => {
    return [...results]
      .sort((a, b) => b.attemptedAt - a.attemptedAt)
      .map((r) => {
        const wiki = docsById.get(r.docId);
        const know = docsById.get(`know/${r.docId}`);
        const meta = wiki ?? know ?? null;
        return {
          key: r.docId + r.attemptedAt,
          docId: meta?.id ?? (wiki ? r.docId : `know/${r.docId}`),
          title: meta?.title ?? prettifyId(r.docId),
          href: meta?.href ?? '#',
          score: r.score,
          total: r.total,
          weak: isWeak(r),
          attemptedAt: r.attemptedAt,
        };
      });
  }, [results, docsById]);

  return (
    <div className="prose-notion" style={{ paddingTop: '4.5rem', paddingBottom: 'var(--space-7)' }}>
      <PageFrame
        eyebrow="Quizzes"
        title="Past attempts."
        description="Every check you've taken, newest first."
      >
        {!mounted ? null : items.length === 0 ? (
          <div
            style={{
              padding: 'var(--space-4) 0',
              color: 'var(--muted)',
              fontStyle: 'italic',
              borderBottom: '0.5px solid var(--mat-border)',
            }}
          >
            No attempts yet. Take a check at the end of any chapter.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {items.map((it) => (
              <li key={it.key}>
                <Link
                  href={it.href}
                  style={{
                    display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)',
                    padding: '0.7rem 0',
                    color: 'var(--fg)', textDecoration: 'none',
                    borderBottom: '0.5px solid var(--mat-border)',
                  }}
                >
                  <span style={{
                    flex: 1, minWidth: 0,
                    fontFamily: 'var(--display)',
                    fontSize: '1rem',
                    fontWeight: 500,
                    letterSpacing: '-0.012em',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{it.title}</span>
                  <span className="t-caption" style={{
                    color: it.weak ? 'var(--tint-red)' : 'var(--muted)',
                    flexShrink: 0,
                    fontVariantNumeric: 'tabular-nums',
                    fontFamily: 'var(--mono)',
                  }}>{it.score}/{it.total}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PageFrame>
    </div>
  );
}
