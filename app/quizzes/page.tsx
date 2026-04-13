'use client';
/**
 * /quizzes — every quiz attempt, by source.
 *
 * §1, §11 — the previous version had: PageHero with stats (taken / average /
 * perfect / weak), a 3-button segmented filter (All/Weak/Perfect), conic
 * score donuts on every row, "needs review" red labels, and a colored
 * "Retake →" CTA. Pure surveillance scoreboard.
 *
 * The new version is the same shape as /notes and /highlights: a single
 * list, accent doc-title links, score as plain text, click → source. No
 * filter (you can read 5 lines), no donut, no CTA, no copy.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isWeak, useQuizResults } from '../../lib/use-quiz';

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
  const router = useRouter();
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

  if (!mounted) return null;
  if (items.length === 0) return null;

  const focus = items.find((item) => item.weak) ?? items[0];
  const openKesi = () => {
    router.push(`/kesi?focus=${encodeURIComponent(focus.docId)}`);
  };
  const openRelations = () => {
    router.push(`/graph?focus=${encodeURIComponent(focus.docId)}`);
  };

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
        }}>Quizzes</span>
        <span aria-hidden style={{
          flex: 1, height: 1, background: 'var(--mat-border)',
        }} />
      </div>

      {focus && (
        <section
          style={{
            padding: '0.1rem 0 1rem',
            marginBottom: 20,
            borderBottom: '0.5px solid var(--mat-border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span aria-hidden style={{ width: 14, height: 1, background: 'var(--accent)', opacity: 0.65 }} />
            <span
              className="t-caption2"
              style={{
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 700,
              }}
            >
              Return to this check
            </span>
            <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div
                style={{
                  fontFamily: 'var(--display)',
                  fontSize: '1.18rem',
                  fontWeight: 650,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.25,
                  marginBottom: 6,
                }}
              >
                {focus.title}
              </div>

              <div
                className="t-caption2"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  color: 'var(--muted)',
                  letterSpacing: '0.04em',
                  marginBottom: 8,
                }}
              >
                <span>{focus.score}/{focus.total}</span>
                <span aria-hidden>·</span>
                <span>{formatWhen(focus.attemptedAt)}</span>
              </div>

              <div
                style={{
                  color: 'var(--fg-secondary)',
                  fontSize: '0.9rem',
                  lineHeight: 1.55,
                }}
              >
                {focus.weak
                  ? 'The last verification attempt did not settle cleanly. Return to the source and tighten the weave before testing again.'
                  : 'You have already tested this material once. Return to the source if you want to verify that the understanding still holds.'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexShrink: 0, alignSelf: 'center' }}>
              <button
                type="button"
                onClick={() => router.push(focus.href)}
                style={quizActionStyle(true)}
              >
                Return to source
              </button>
            </div>
          </div>
        </section>
      )}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {items.map((it) => (
          <li key={it.key}>
            <Link
              href={it.href}
              style={{
                display: 'flex', alignItems: 'baseline', gap: 14,
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
                color: 'var(--muted)', flexShrink: 0,
                fontVariantNumeric: 'tabular-nums',
                fontFamily: 'var(--mono)',
              }}>{it.score}/{it.total}</span>
            </Link>
          </li>
        ))}
      </ul>
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

function quizActionStyle(primary: boolean) {
  return {
    appearance: 'none' as const,
    border: 0,
    borderBottom: `0.5px solid ${primary ? 'var(--accent)' : 'var(--mat-border)'}`,
    background: 'transparent',
    color: primary ? 'var(--accent)' : 'var(--fg-secondary)',
    borderRadius: 999,
    padding: '0.3rem 0',
    fontSize: '0.82rem',
    fontWeight: 650,
    letterSpacing: '-0.01em',
    lineHeight: 1,
    cursor: 'pointer',
  };
}
